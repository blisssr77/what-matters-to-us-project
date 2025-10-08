import React, { useState } from "react";
import {
  CalendarDays,
  CheckCircle2,
  GitBranch,
  Lightbulb,
  ListTodo,
  Rocket,
  Loader2,
  Star,
} from "lucide-react";
import Layout from "@/components/Layout/Layout";

export default function WProjectPlanner() {
  const [email, setEmail] = useState("");
  const [sending, setSending] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    if (!email) return;
    setSending(true);
    // Hook this up to your backend later
    await new Promise((r) => setTimeout(r, 900));
    setSending(false);
    setDone(true);
    setEmail("");
  };

  return (
    <Layout noGutters contentBg="bg-gray-100">
        <div className="min-h-[100dvh] bg-gradient-to-b from-slate-50 via-white to-slate-50 text-slate-800">
        {/* Top banner */}
        <header className="border-b bg-white/70 backdrop-blur">
            <div className="mx-auto max-w-6xl px-4 py-4 flex items-center justify-between">
            <div className="flex items-center gap-2">
                <span className="inline-flex h-8 w-8 items-center justify-center rounded-lg bg-indigo-600 text-white">
                <GitBranch size={18} />
                </span>
                <div className="font-semibold">WhatMatters</div>
                <span className="mx-2 text-slate-300">/</span>
                <div className="text-slate-600">Project Planner</div>
            </div>

            <div className="hidden sm:flex items-center gap-2">
                <span className="inline-flex items-center gap-1 rounded-full bg-emerald-50 text-emerald-700 px-2.5 py-1 text-xs border border-emerald-100">
                <Rocket size={14} /> In active development
                </span>
            </div>
            </div>
        </header>

        <main className="mx-auto max-w-6xl px-4 py-10 sm:py-14">
            {/* Hero */}
            <section className="grid lg:grid-cols-2 gap-8 items-center">
            <div>
                <div className="inline-flex items-center gap-2 rounded-full bg-indigo-50 border border-indigo-100 px-3 py-1 text-indigo-700 text-xs font-semibold">
                <Star size={14} /> New app experience
                </div>
                <h1 className="mt-3 text-3xl sm:text-4xl font-extrabold tracking-tight">
                Project Planner is arriving soon
                </h1>
                <p className="mt-3 text-slate-600 leading-relaxed">
                Plan sprints, map milestones, and turn ideas into shipped work.
                Project Planner brings tasks, docs, and your calendar together—
                so you can see the why, who, and when in one place.
                </p>

                {/* Notify / waitlist */}
                <form onSubmit={submit} className="mt-5 flex flex-col sm:flex-row gap-2">
                <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    placeholder="Your email for early access"
                    className="w-full sm:max-w-sm rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-indigo-200"
                />
                <button
                    type="submit"
                    disabled={sending}
                    className="inline-flex items-center justify-center gap-2 rounded-lg bg-indigo-600 text-white px-4 py-2 text-sm font-semibold hover:bg-indigo-700 disabled:opacity-60"
                >
                    {sending ? <Loader2 size={16} className="animate-spin" /> : <Rocket size={16} />}
                    {sending ? "Sending..." : "Notify me"}
                </button>
                </form>
                {done && (
                <div className="mt-2 text-xs text-emerald-700 inline-flex items-center gap-1 bg-emerald-50 border border-emerald-100 px-2.5 py-1 rounded">
                    <CheckCircle2 size={14} /> Added to the list—thank you!
                </div>
                )}

                {/* Feature chips */}
                <div className="mt-6 flex flex-wrap gap-2">
                <Chip icon={<ListTodo size={14} />} text="Tasks & sub-tasks" />
                <Chip icon={<CalendarDays size={14} />} text="Calendar timelines" />
                <Chip icon={<Lightbulb size={14} />} text="Docs that link to work" />
                </div>
            </div>

            {/* Preview card */}
            <PreviewCard />
            </section>

            {/* Roadmap/Status */}
            <section className="mt-12 grid md:grid-cols-3 gap-6">
            <StatCard title="Private beta" value="Q4" note="Invite wave #1" />
            <StatCard title="Public launch" value="Q1" note="Open to all teams" />
            <StatCard title="Integrations" value="Ongoing" note="Slack, GitHub, Drive" />
            </section>

            {/* Placeholder footer CTA */}
            <section className="mt-12 border rounded-xl bg-white p-5 sm:p-6">
            <div className="flex flex-col sm:flex-row items-start sm:items-center gap-4 justify-between">
                <div>
                <h3 className="font-semibold">Want to help shape it?</h3>
                <p className="text-sm text-slate-600">
                    Join a 15-minute feedback session and influence the first release.
                </p>
                </div>
                <button className="rounded-lg border border-slate-300 px-4 py-2 text-sm hover:bg-slate-50">
                I’m in
                </button>
            </div>
            </section>
        </main>
        </div>
    </Layout>
  );
}

/* ---------- Small presentational bits ---------- */

function Chip({ icon, text }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-700 border border-slate-200">
      {icon} {text}
    </span>
  );
}

function StatCard({ title, value, note }) {
  return (
    <div className="rounded-xl border bg-white p-5">
      <div className="text-xs font-semibold text-slate-500">{title}</div>
      <div className="mt-1 text-2xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{note}</div>
    </div>
  );
}

function PreviewCard() {
  return (
    <div className="rounded-2xl border bg-white p-4 sm:p-5 shadow-sm">
      <div className="flex items-center justify-between">
        <div className="font-semibold">Sprint 12 · “Polaris”</div>
        <span className="text-xs rounded-full bg-amber-50 text-amber-700 px-2 py-1 border border-amber-100">
          Mock preview
        </span>
      </div>

      {/* timeline rows */}
      <div className="mt-4 space-y-3">
        <Row title="Design review" left="Sep 23" right="Sep 24" color="bg-indigo-600" />
        <Row title="API milestone" left="Sep 25" right="Sep 27" color="bg-emerald-600" />
        <Row title="Release prep" left="Sep 29" right="Oct 01" color="bg-sky-600" />
      </div>

      {/* checklist */}
      <div className="mt-5 border-t pt-4">
        <div className="text-xs font-semibold text-slate-600 mb-2">Launch checklist</div>
        <ul className="space-y-2 text-sm">
          <li className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={16} /> PRD approved
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="text-emerald-600" size={16} /> QA scenarios drafted
          </li>
          <li className="flex items-center gap-2">
            <CheckCircle2 className="text-slate-300" size={16} /> Rollout plan
          </li>
        </ul>
      </div>
    </div>
  );
}

function Row({ title, left, right, color }) {
  return (
    <div>
      <div className="flex items-center justify-between text-xs text-slate-500">
        <span>{left}</span>
        <span>{right}</span>
      </div>
      <div className="mt-1 flex items-center gap-3">
        <div className={`h-2 w-20 rounded-full ${color}`}></div>
        <div className="text-sm">{title}</div>
      </div>
    </div>
  );
}
