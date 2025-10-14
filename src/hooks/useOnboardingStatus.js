import { useEffect, useCallback, useState } from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export function useOnboardingStatus({ refresh = false } = {}) {
  // ✅ Select individual fields so their identities are stable
  const { lastCheckedAt, setState } = useOnboardingStore();

  // (the rest are read-only for consumers; we don’t need them inside this hook)
  const [wsVaultCodeSet, setWsVaultCodeSet] = useState(null); // null | boolean
  const [pvVaultCodeSet, setPvVaultCodeSet] = useState(null); // null | boolean

  // ✅ Memoized loader depends only on stable setState
  const load = useCallback(async () => {
    try {
      setState({ loading: true, error: '' });

      // while loading, mark unknown so UI can gate on readiness
      setWsVaultCodeSet(null);
      setPvVaultCodeSet(null);

      const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;

      if (!user?.id) {
        setWsVaultCodeSet(false);
        setPvVaultCodeSet(false);
        setState({
          loading: false,
          error: '',
          hasVaultCode: false,
          createdFirstDoc: false,
          connectedCalendar: false,
          hasProfile: false,
          emailVerified: false,
          createdWorkspace: false,
          createdPrivateSpace: false,
          lastCheckedAt: dayjs().toISOString(),
        });
        return;
      }

      const uid = user.id;

      const profPromise = supabase
        .from('profiles_secure')
        .select('id, first_name, last_name, email_verified')
        .eq('id', uid)
        .maybeSingle();

      const codesPromise = supabase
        .from('vault_codes')
        .select('workspace_code_hash, private_code_hash')
        .eq('id', uid)
        .maybeSingle();

      const myWSCountPromise = supabase
        .from('workspace_members')
        .select('workspace_id', { count: 'exact', head: true })
        .eq('user_id', uid);

      const myPSCountPromise = supabase
        .from('private_spaces')
        .select('id', { count: 'exact', head: true })
        .eq('created_by', uid);

      const anyPSWithCodePromise = supabase
        .from('private_spaces')
        .select('id', { head: true, count: 'exact' })
        .eq('created_by', uid)
        .not('vault_code_hash', 'is', null);

      const wsDocCountPromise = supabase
        .from('workspace_vault_items')
        .select('id', { head: true, count: 'exact' })
        .eq('created_by', uid);

      const pvDocCountPromise = supabase
        .from('private_vault_items')
        .select('id', { head: true, count: 'exact' })
        .eq('created_by', uid);

      const settingsPromise = supabase
        .from('user_settings')
        .select('calendar_connected')
        .eq('user_id', uid)
        .maybeSingle();

      const wsCalEnabledPromise = supabase
        .from('workspace_calendar_items_secure')
        .select('id', { head: true, count: 'exact' })
        .eq('calendar_enabled', true)
        .eq('created_by', uid);

      const pvCalEnabledPromise = supabase
        .from('private_calendar_items_secure')
        .select('id', { head: true, count: 'exact' })
        .eq('calendar_enabled', true)
        .eq('created_by', uid);

      const [
        { data: prof },
        wsCount,
        psCount,
        psWithCode,
        wsDocs,
        pvDocs,
        { data: settings },
        wsCal,
        pvCal,
        { data: codes },
      ] = await Promise.all([
        profPromise,
        myWSCountPromise,
        myPSCountPromise,
        anyPSWithCodePromise,
        wsDocCountPromise,
        pvDocCountPromise,
        settingsPromise,
        wsCalEnabledPromise,
        pvCalEnabledPromise,
        codesPromise,
      ]);

      const hasWorkspaceCode = !!codes?.workspace_code_hash;
      const hasPrivateCode   = !!codes?.private_code_hash || (psWithCode?.count ?? 0) > 0;
      const vaultOK          = hasWorkspaceCode || hasPrivateCode;

      const firstDocExists    = (wsDocs?.count ?? 0) > 0 || (pvDocs?.count ?? 0) > 0;

      const calendarBySettings = !!settings?.calendar_connected;
      const calendarByItems    = (wsCal?.count ?? 0) > 0 || (pvCal?.count ?? 0) > 0;
      const calendarOK         = calendarBySettings || calendarByItems;

      const profileOK          = !!prof;
      const emailOK            = !!prof?.email_verified;
      const workspaceOK        = (wsCount?.count ?? 0) > 0;
      const privateSpaceOK     = (psCount?.count ?? 0) > 0;

      setWsVaultCodeSet(hasWorkspaceCode);
      setPvVaultCodeSet(hasPrivateCode);

      setState({
        loading: false,
        error: '',
        hasVaultCode: vaultOK,
        createdFirstDoc: firstDocExists,
        connectedCalendar: calendarOK,
        hasProfile: profileOK,
        emailVerified: emailOK,
        createdWorkspace: workspaceOK,
        createdPrivateSpace: privateSpaceOK,
        lastCheckedAt: dayjs().toISOString(),
      });
    } catch (e) {
      setState({ loading: false, error: e?.message || 'Failed to load onboarding status' });
      // ensure flags don’t stay null forever on error
      setWsVaultCodeSet(false);
      setPvVaultCodeSet(false);
    }
  }, [setState]);

  // ✅ Only run when the timestamp changes or refresh prop toggles
  useEffect(() => {
    if (!lastCheckedAt || refresh) load();
  }, [lastCheckedAt, refresh, load]);

  // ✅ Auth change: clear on sign-out; trigger fresh load once on other events
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
        setWsVaultCodeSet(false);
        setPvVaultCodeSet(false);
        setState({
          hasVaultCode: false,
          createdFirstDoc: false,
          connectedCalendar: false,
          hasProfile: false,
          emailVerified: false,
          createdWorkspace: false,
          createdPrivateSpace: false,
          lastCheckedAt: null,
        });
      } else {
        // trigger one refresh path (effect above will notice lastCheckedAt === null)
        setState({ lastCheckedAt: null });
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [setState]);

  // also expose loading/error from store via selectors (stable)
  const loading  = useOnboardingStore(s => s.loading);
  const error    = useOnboardingStore(s => s.error);

  // NEW: expose readiness to prevent flicker in UI
  const flagsReady = wsVaultCodeSet !== null && pvVaultCodeSet !== null && !loading;

  return {
    loading,
    error,
    reloadOnboarding: load,
    wsVaultCodeSet,   // null | boolean
    pvVaultCodeSet,   // null | boolean
    flagsReady,       // boolean
  };
}
