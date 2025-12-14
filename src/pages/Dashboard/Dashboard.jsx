import React, { useMemo, useEffect } from "react";
import { useOnboardingStatus } from "@/hooks/useOnboardingStatus";
import { useOnboardingStore } from "@/store/useOnboardingStore";
import {
  ShieldCheck, Lock, FileText, CalendarDays, Users, CheckCircle2, Wand2,
  FolderLock, KeyRound, Link2, Rocket, ChevronRight, LogIn, BadgeCheck, RefreshCw
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import Layout from "@/components/Layout/Layout";

/* --- Dashboard page --- */
export default function Dashboard() {
  const navigate = useNavigate();

  // onboarding status hook
  const { loading, error, reloadOnboarding, wsVaultCodeSet, pvVaultCodeSet } = useOnboardingStatus();

  // onboarding flags from store
  const {
    hasVaultCode,
    createdFirstDoc,
    connectedCalendar,
    hasProfile,
    emailVerified,
    createdWorkspace,
    createdPrivateSpace,
  } = useOnboardingStore();

  // Define steps based on onboarding flags
  const steps = useMemo(
    () => [
      { key: "profile",   done: hasProfile,          label: "Complete your profile",      href: "/account/manage",       icon: <BadgeCheck size={16}/> },
      { key: "verify",    done: emailVerified,       label: "Verify your email",          href: "/account/manage",       icon: <LogIn size={16}/> },
      { key: "ws-code",   done: !!wsVaultCodeSet,    label: "Set your Workspace Code",    href: "/account/manage#vault", icon: <KeyRound size={16}/> },
      { key: "pv-code",   done: !!pvVaultCodeSet,    label: "Set your Private Code",      href: "/account/manage#vault", icon: <KeyRound size={16}/> },
      { key: "workspace", done: createdWorkspace,    label: "Create a Workspace",         href: "/workspace/vaults",     icon: <Users size={16}/> },
      { key: "private",   done: createdPrivateSpace, label: "Create your Private Space",  href: "/privatespace/vaults",  icon: <FolderLock size={16}/> },
      { key: "firstdoc",  done: createdFirstDoc,     label: "Add your first note or doc", href: "/workspace/vaults",     icon: <FileText size={16}/> },
      { key: "calendar",  done: connectedCalendar,   label: "Connect & schedule items",   href: "/calendar",             icon: <CalendarDays size={16}/> },
    ],
    [
      hasProfile,
      emailVerified,
      wsVaultCodeSet,
      pvVaultCodeSet,
      createdWorkspace,
      createdPrivateSpace,
      createdFirstDoc,
      connectedCalendar
    ]
  );

  // Load onboarding status on mount
  useEffect(() => {
    reloadOnboarding();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Calculate overall progress percentage
  const progress = useMemo(() => {
    const done = steps.filter(s => s.done).length;
    return Math.round((done / steps.length) * 100);
  }, [steps]);

  // --- loading state ---
  if (loading) {
    return (
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100 flex items-center justify-center">
        <div className="animate-pulse text-slate-300">Loading your dashboard…</div>
      </div>
    );
  }

  return (
    <Layout noGutters contentBg="bg-gray-100">
      <div className="min-h-[100dvh] bg-slate-950 text-slate-100">
        {/* Top bar */}
        <header className="sticky top-0 z-40 border-b border-white/10 bg-slate-950/70 backdrop-blur">
          <div className="mx-auto max-w-7xl px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-indigo-600 to-violet-600 text-white shadow-lg shadow-violet-900/30">
                <Wand2 size={18} />
              </span>
              <div className="text-sm text-slate-300">Welcome to</div>
              <div className="font-semibold tracking-tight">WhatMatters</div>
            </div>
            <div className="flex items-center gap-2">
              <button
                onClick={reloadOnboarding}
                disabled={loading}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
                aria-busy={loading}
                title="Refresh onboarding status"
              >
                <RefreshCw size={14} className={loading ? "animate-spin" : ""} />
                {loading ? "Checking…" : "Refresh"}
              </button>
              <button
                onClick={() => navigate("/account/manage")}
                className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-1.5 text-xs hover:bg-white/10"
              >
                Manage account <ChevronRight size={14} />
              </button>
            </div>
          </div>
        </header>

        <main className="mx-auto max-w-7xl px-4 pb-16">
          {/* Hero */}
          <section className="mt-8 grid lg:grid-cols-[1.1fr_.9fr] gap-6 items-stretch">
            <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5 sm:p-6">
              <div className="inline-flex items-center gap-2 rounded-full border border-emerald-400/20 bg-emerald-400/10 px-2.5 py-1 text-[11px] text-emerald-300">
                <Rocket size={14} /> Onboarding assistant
              </div>
              <h1 className="mt-3 text-2xl sm:text-3xl font-extrabold tracking-tight">
                Let’s finish setting up your account
              </h1>
              <p className="mt-2 text-sm text-slate-300 leading-relaxed">
                WhatMatters keeps your notes and files safe with zero-trust vaults and precise sharing.  
                Complete the steps below to unlock encrypted docs, private spaces, and a calendar that respects your privacy.
              </p>

              {/* Progress */}
              <div className="mt-5 aria-busy={loading}">
                <div className="flex items-center justify-between text-xs text-slate-400">
                  <span>Setup progress</span>
                  <span className="text-slate-200 font-semibold">{progress}%</span>
                </div>
                <div className="mt-2 h-2.5 w-full overflow-hidden rounded-full bg-white/5 ring-1 ring-inset ring-white/10">
                  <div
                    className="h-full bg-gradient-to-r from-indigo-500 via-violet-500 to-fuchsia-600"
                    style={{ width: `${progress}%` }}
                  />
                </div>
              </div>

              {/* Steps */}
              <ul className="mt-5 grid sm:grid-cols-2 gap-3">
                {steps.map((s) => (
                  <li
                    key={s.key}
                    className="group flex items-center gap-3 rounded-xl border border-white/10 bg-white/5 px-3 py-2 hover:bg-white/10"
                  >
                    <span className={`inline-flex h-7 w-7 items-center justify-center rounded-lg
                      ${s.done ? "bg-emerald-500/20 text-emerald-300" : "bg-slate-800 text-slate-300"}`
                    }>
                      {s.done ? <CheckCircle2 size={16}/> : s.icon}
                    </span>
                    <div className="flex-1">
                      <div className="text-sm">{s.label}</div>
                      <div className="text-[11px] text-slate-400">{s.done ? "Completed" : "Required"}</div>
                    </div>
                    <button
                      onClick={() => navigate(s.href)}
                      disabled={loading}
                      className="text-[11px] inline-flex items-center gap-1 rounded-md border border-white/10 px-2 py-1 text-slate-200 hover:bg-white/10"
                    >
                      {s.done ? "Review" : "Go"} <ChevronRight size={12}/>
                    </button>
                  </li>
                ))}
              </ul>
            </div>

            {/* Security highlight */}
            <SecurityCard navigate={navigate} />
          </section>

          {/* Error banner */}
          {error ? (
            <div className="mt-6 rounded-lg border border-red-400/30 bg-red-500/10 p-3 text-xs text-red-300">
              {error}
            </div>
          ) : null}

          {/* Features */}
          <section className="mt-8">
            <h2 className="text-lg font-bold tracking-tight">Everything you need, respectfully private</h2>
            <p className="mt-1 text-sm text-slate-300">
              Create together without leaking what matters. Here’s what’s built-in:
            </p>
            <div className="mt-4 grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
              {/* <Feature
                icon={<FileText size={16} />}
                title="Docs & Notes"
                desc="Beautiful notes or encrypted docs with tags, attachments and public excerpts."
                cta="Open Vaults"
                onClick={() => navigate("/workspace/vaults")}
              /> */}
              <Feature
                icon={<FolderLock size={16} />}
                title="Private Spaces"
                desc="Your personal vault. Keep sensitive notes/files fully separated and encrypted."
                cta="My Private Space"
                onClick={() => navigate("/privatespace")}
              />
              <Feature
                icon={<Users size={16} />}
                title="Workspaces"
                desc="Organize teams with membership, roles, and visible–when–allowed sharing."
                cta="Manage Workspaces"
                onClick={() => navigate("/workspaces")}
              />
              <Feature
                icon={<CalendarDays size={16} />}
                title="Calendar"
                desc="Day/Week/Month views. See workspace + private items with transparent privacy."
                cta="Open Calendar"
                onClick={() => navigate("/calendar")}
              />
              {/* <Feature
                icon={<Link2 size={16} />}
                title="Smart Linking"
                desc="Link docs to tasks, events, or tags. Everything connected, never exposed."
                cta="Start Linking"
                onClick={() => navigate("/workspace/vaults")}
              /> */}
              {/* <Feature
                icon={<Wand2 size={16} />}
                title="AI Assist (Opt-in)"
                desc="Ask for summaries or plans—AI only sees what you allow and nothing else."
                cta="Enable AI Assist"
                onClick={() => navigate("/account/manage#ai")}
              /> */}
            </div>
          </section>

          {/* Next actions */}
          <section className="mt-10 grid md:grid-cols-2 gap-6">
            <Callout
              title="Finish account setup"
              desc="Set your Vault Code, confirm your profile, and configure preferences."
              button="Go to Manage Account"
              onClick={() => navigate("/account/manage")}
            />
            {/* <Callout
              title="Create your first encrypted doc"
              desc="Start with a note, then attach files and schedule it on your calendar."
              button="Create Doc"
              onClick={() => navigate("/workspace/vaults/note-upload")}
            /> */}
          </section>
        </main>
      </div>
    </Layout>
  );
}

/* ---------- pieces ---------- */

function SecurityCard({ navigate }) {
  return (
    <div className="rounded-2xl border border-violet-500/20 bg-gradient-to-br from-violet-900/20 to-indigo-900/20 p-5 sm:p-6 ring-1 ring-inset ring-violet-500/10">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-9 w-9 items-center justify-center rounded-xl bg-violet-600 text-white shadow-lg shadow-violet-900/30">
          <ShieldCheck size={18} />
        </span>
        <div>
          <h3 className="font-semibold">Trust by design</h3>
          <p className="text-sm text-slate-300">
            We never assume access. You decide what’s visible—and to whom.
          </p>
        </div>
      </div>

      <ul className="mt-4 space-y-3 text-sm">
        <li className="flex items-start gap-3">
          <span className="mt-0.5 text-emerald-300"><Lock size={16}/></span>
          <div>
            <div className="font-medium">Vault Code protection</div>
            <p className="text-slate-300/80">
              Private-by-default areas (workspaces & personal vaults) require your Vault Code to view sensitive content.
              Public excerpts stay open—private bodies remain sealed until unlocked.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 text-indigo-300"><FolderLock size={16}/></span>
          <div>
            <div className="font-medium">Granular visibility</div>
            <p className="text-slate-300/80">
              Public, workspace-only, or private. Items render “masked” where you don’t have rights—titles can be visible while contents stay protected.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 text-fuchsia-300"><KeyRound size={16}/></span>
          <div>
            <div className="font-medium">Zero-trust workflows</div>
            <p className="text-slate-300/80">
              Access is verified at read time, not assumed. Sensitive actions prompt for Vault Code when needed—no silent grants.
            </p>
          </div>
        </li>
        <li className="flex items-start gap-3">
          <span className="mt-0.5 text-indigo-300"><Lock size={16}/></span>
          <div>
            <div className="font-medium">AI-Powered Note Summaries</div>
            <p className="text-slate-300/80">
              Quickly condense long notes into clean, readable summaries using OpenAI. 
              Private notes stay fully protected—your Vault Code decrypts locally before sending secure text for summarization.
            </p>
          </div>
        </li>
      </ul>

      <div className="mt-5 flex gap-2">
        <button
          onClick={() => navigate("/account/manage#vault")}
          className="inline-flex items-center gap-2 rounded-lg bg-violet-600 px-3 py-2 text-sm font-semibold text-white hover:bg-violet-700"
        >
          Set Vault Code
        </button>
        {/* <button
          onClick={() => navigate("/security/learn-more")}
          className="inline-flex items-center gap-2 rounded-lg border border-white/10 bg-white/5 px-3 py-2 text-sm hover:bg-white/10"
        >
          Learn more
        </button> */}
      </div>
    </div>
  );
}

function Feature({ icon, title, desc, cta, onClick }) {
  return (
    <div className="rounded-xl border border-white/10 bg-white/5 p-4 hover:bg-white/10 transition">
      <div className="flex items-center gap-2">
        <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-white/10 text-slate-100">
          {icon}
        </span>
        <div className="font-semibold">{title}</div>
      </div>
      <p className="mt-2 text-sm text-slate-300">{desc}</p>
      <button
        onClick={onClick}
        className="mt-3 inline-flex items-center gap-1 rounded-md border border-white/10 bg-white/5 px-2.5 py-1.5 text-xs hover:bg-white/10"
      >
        {cta} <ChevronRight size={12} />
      </button>
    </div>
  );
}

function Callout({ title, desc, button, onClick }) {
  return (
    <div className="rounded-2xl border border-white/10 bg-gradient-to-br from-slate-900 to-slate-950 p-5">
      <div className="text-base font-semibold">{title}</div>
      <p className="mt-1 text-sm text-slate-300">{desc}</p>
      <button
        onClick={onClick}
        className="mt-4 inline-flex items-center gap-2 rounded-lg bg-indigo-600 px-3.5 py-2 text-sm font-semibold text-white hover:bg-indigo-700"
      >
        {button} <ChevronRight size={14}/>
      </button>
    </div>
  );
}
