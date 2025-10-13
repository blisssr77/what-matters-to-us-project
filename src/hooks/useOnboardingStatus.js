import { useEffect, useCallback } from 'react';
import dayjs from 'dayjs';
import { supabase } from '@/lib/supabaseClient';
import { useOnboardingStore } from '@/store/useOnboardingStore';

export function useOnboardingStatus({ refresh = false } = {}) {
  const {
    loading, error,
    hasVaultCode, createdFirstDoc, connectedCalendar,
    hasProfile, emailVerified, createdWorkspace, createdPrivateSpace,
    lastCheckedAt, setState,
  } = useOnboardingStore();

  const load = useCallback(async () => {
    try {
      setState({ loading: true, error: '' });

      // 1) current user
      const { data: { user } = {}, error: uErr } = await supabase.auth.getUser();
      if (uErr) throw uErr;

      // If not signed in, clear everything and stop
      if (!user?.id) {
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

      // ---- Parallel queries (scoped to THIS user) ----
      const profPromise = supabase
        .from('profiles_secure')
        .select('id, first_name, last_name, email_verified, vault_code_set')
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

      // 👇 IMPORTANT: scope calendar-enabled counts to THIS user.
      // If your schema uses a different column (e.g., user_id/owner_id),
      // replace 'created_by' with that column.
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
      ]);

      // ---- Compute flags ----
      const hasVaultByProfile = !!prof?.vault_code_set;
      const hasVaultByPS      = (psWithCode?.count ?? 0) > 0;
      const vaultOK           = hasVaultByProfile || hasVaultByPS;

      const firstDocExists    = (wsDocs?.count ?? 0) > 0 || (pvDocs?.count ?? 0) > 0;

      const calendarBySettings = !!settings?.calendar_connected;
      const calendarByItems    = (wsCal?.count ?? 0) > 0 || (pvCal?.count ?? 0) > 0;
      const calendarOK         = calendarBySettings || calendarByItems;

      const profileOK          = !!prof; // tighten if needed
      const emailOK            = !!prof?.email_verified;
      const workspaceOK        = (wsCount?.count ?? 0) > 0;
      const privateSpaceOK     = (psCount?.count ?? 0) > 0;

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
      setState({
        loading: false,
        error: e?.message || 'Failed to load onboarding status',
      });
    }
  }, [setState]);

  // Initial load (and allow forcing via { refresh: true })
  useEffect(() => {
    if (!lastCheckedAt || refresh) load();
  }, [lastCheckedAt, refresh, load]);

  // Refresh on auth changes. Also clear flags on sign-out to avoid stale UI.
  useEffect(() => {
    const { data: sub } = supabase.auth.onAuthStateChange((event) => {
      if (event === 'SIGNED_OUT') {
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
        // force a fresh load on next render
        setState({ lastCheckedAt: null });
      }
    });
    return () => sub?.subscription?.unsubscribe?.();
  }, [setState]);

  return {
    loading,
    error,
    hasVaultCode,
    createdFirstDoc,
    connectedCalendar,

    hasProfile,
    emailVerified,
    createdWorkspace,
    createdPrivateSpace,

    reloadOnboarding: load,
  };
}
