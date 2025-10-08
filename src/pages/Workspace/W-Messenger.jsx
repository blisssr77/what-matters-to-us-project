import { MessageCircle, Lock, Sparkles, Clock, ArrowLeft, Bell, Mail } from "lucide-react";
import Layout from "@/components/Layout/Layout";

export default function WMessenger() {
  return (
    <Layout noGutters contentBg="bg-gray-100">
        <div className="min-h-[calc(100vh-64px)] bg-gradient-to-b from-slate-50 to-white">
        {/* Top bar */}
        <header className="sticky top-0 z-10 border-b bg-white/80 backdrop-blur supports-[backdrop-filter]:bg-white/60">
            <div className="mx-auto max-w-6xl px-4 h-14 flex items-center gap-3">
            <div className="flex items-center gap-2 text-slate-800">
                <div className="h-8 w-8 grid place-items-center rounded-xl bg-gradient-to-br from-indigo-500 to-violet-600 text-white shadow-sm">
                <MessageCircle size={18} />
                </div>
                <h1 className="text-sm font-semibold tracking-tight">Messenger</h1>
                <span className="ml-2 text-[11px] font-semibold text-white bg-slate-900 rounded-full px-2 py-[2px]">Coming soon</span>
            </div>

            <div className="ml-auto flex items-center gap-2">
                <button
                type="button"
                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs rounded-lg border bg-white hover:bg-slate-50 text-slate-700"
                onClick={() => window.history.back?.()}
                >
                <ArrowLeft size={14} /> Back
                </button>
            </div>
            </div>
        </header>

        {/* Hero */}
        <section className="mx-auto max-w-6xl px-4 py-10 grid md:grid-cols-[1.15fr_0.85fr] gap-8 items-start">
            {/* Left: Preview card */}
            <div className="rounded-2xl border bg-white shadow-sm overflow-hidden">
            <div className="p-4 border-b flex items-center justify-between">
                <div className="flex items-center gap-2">
                <div className="h-8 w-8 rounded-full bg-gradient-to-br from-indigo-500 to-violet-600" />
                <div>
                    <div className="text-sm font-semibold text-slate-900">WhatMatters</div>
                    <div className="text-[11px] text-slate-500">smart messaging preview</div>
                </div>
                </div>
                <span className="text-[11px] px-2 py-[2px] rounded-full bg-emerald-50 text-emerald-700 border border-emerald-100">private-by-default</span>
            </div>

            {/* Chat mock */}
            <div className="p-4 bg-slate-50/60 text-gray-500">
                <ChatBubble side="left">
                New Messenger is in the works — fast, secure, and beautifully minimal.
                </ChatBubble>
                <ChatBubble side="right">
                Can it share notes and calendar items?
                </ChatBubble>
                <ChatBubble side="left">
                Yep. Threads can reference docs, tasks, and events without copy‑paste.
                </ChatBubble>

                <div className="mt-4 grid grid-cols-3 gap-3 text-[11px]">
                <FeaturePill icon={<Lock size={12}/>}    title="End‑to‑end" />
                <FeaturePill icon={<Sparkles size={12}/>} title="Smart replies" />
                <FeaturePill icon={<Clock size={12}/>}    title="Real‑time" />
                </div>

                {/* Input mock */}
                <div className="mt-5 flex items-center gap-2 rounded-xl border bg-white px-3 py-2">
                <div className="i w-2 h-2 rounded-full bg-slate-300" />
                <input disabled className="flex-1 bg-transparent text-sm placeholder:text-slate-400 focus:outline-none" placeholder="Type a message… (soon)" />
                <button disabled className="text-xs px-2 py-1 rounded-md bg-slate-200 text-slate-600">Send</button>
                </div>
            </div>
            </div>

            {/* Right: Copy & Notify */}
            <aside className="space-y-4">
            <div className="rounded-2xl border bg-white shadow-sm p-5">
                <h2 className="text-sm font-semibold text-slate-900">That Messenger Page will be available soon</h2>
                <p className="mt-1.5 text-sm leading-relaxed text-slate-600">
                Thank you for using <span className="font-semibold">WhatMatters</span>. We’re polishing threads, mentions, and encryption. Want a heads‑up when it ships?
                </p>

                <div className="mt-4 grid sm:grid-cols-2 gap-2">
                <button className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm bg-slate-900 text-white hover:bg-black">
                    <Bell size={16}/> Notify me
                </button>
                <button className="inline-flex items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm border bg-white hover:bg-slate-50 text-slate-700">
                    <Mail size={16}/> Join waitlist
                </button>
                </div>
            </div>

            <div className="rounded-2xl border bg-white shadow-sm p-5">
                <h3 className="text-xs font-bold tracking-wide text-slate-600">What to expect</h3>
                <ul className="mt-3 space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500"/> Channels per project/workspace</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500"/> Share notes, docs & calendar clips inline</li>
                <li className="flex items-start gap-2"><span className="mt-1 h-1.5 w-1.5 rounded-full bg-indigo-500"/> Mentions, reactions, file drops</li>
                </ul>
            </div>
            </aside>
        </section>
        </div>
    </Layout>
  );
}

function ChatBubble({ children, side = "left" }) {
  const isRight = side === "right";
  return (
    <div className={
      "max-w-[85%] mt-3 flex " + (isRight ? "justify-end ml-auto" : "justify-start mr-auto")
    }>
      <div className={
        "relative rounded-2xl px-3 py-2 text-sm shadow-sm " +
        (isRight
          ? "bg-slate-900 text-white rounded-tr-sm"
          : "bg-white border rounded-tl-sm")
      }>
        {children}
      </div>
    </div>
  );
}

function FeaturePill({ icon, title }) {
  return (
    <span className="inline-flex items-center gap-1 rounded-full bg-white border text-slate-700 px-2 py-[2px]">
      {icon} {title}
    </span>
  );
}