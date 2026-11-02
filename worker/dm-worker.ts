import { createDMWorker } from "@/lib/queue/dm-worker";
import { recordWorkerHeartbeat } from "@/lib/ops/worker-health";
import { reconcileComments } from "@/lib/polling/comment-reconciler";
import { attachPendingNextReels } from "@/lib/automation/attach-next-reel";
import os from "node:os";

const worker = createDMWorker();
const startedAt = new Date().toISOString();
const HEARTBEAT_INTERVAL_MS = 30_000;
// Polling safety net for comments that webhooks miss. Runs in the worker because
// it must fire every few minutes and Vercel's free crons only run once a day.
const POLL_INTERVAL_MS = Number(
  process.env.COMMENT_POLL_INTERVAL_MS ?? 5 * 60_000
);

console.log("[DM Worker] Started");

async function heartbeat() {
  try {
    await recordWorkerHeartbeat({
      pid: process.pid,
      hostname: os.hostname(),
      startedAt,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Heartbeat failed:", message);
  }
}

void heartbeat();
const heartbeatTimer = setInterval(() => void heartbeat(), HEARTBEAT_INTERVAL_MS);

async function poll() {
  try {
    const attached = await attachPendingNextReels();
    if (attached.bound > 0 || attached.failedAccounts > 0) {
      console.log("[DM Worker] Next-reel attachment:", attached);
    }
    await reconcileComments();
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown error";
    console.error("[DM Worker] Comment reconciliation failed:", message);
  }
}

// Daily jobs (Top Crociere): outside Vercel nothing reads vercel.json, so the
// worker calls the cron routes itself. refresh-tokens is the critical one:
// without it the Instagram token expires and automations stop silently.
const DAILY_JOBS = ["refresh-tokens", "snapshot-followers"] as const;
let lastDailyRun = "";

async function runDailyJobs(force = false) {
  const today = new Date().toISOString().slice(0, 10);
  if (!force && (lastDailyRun === today || new Date().getUTCHours() < 4)) return;
  const baseUrl = process.env.NEXTAUTH_URL?.replace(/\/$/, "");
  const secret = process.env.CRON_SECRET || process.env.NEXTAUTH_SECRET;
  if (!baseUrl || !secret) {
    console.error("[DM Worker] Daily jobs skipped: NEXTAUTH_URL or CRON_SECRET missing");
    return;
  }
  lastDailyRun = today;
  for (const job of DAILY_JOBS) {
    try {
      const response = await fetch(`${baseUrl}/api/cron/${job}`, {
        headers: { Authorization: `Bearer ${secret}` },
        signal: AbortSignal.timeout(180_000),
      });
      console.log(`[DM Worker] Daily ${job}: HTTP ${response.status}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown error";
      console.error(`[DM Worker] Daily ${job} failed:`, message);
    }
  }
}

setTimeout(() => void runDailyJobs(true), 60_000);
const dailyTimer = setInterval(() => void runDailyJobs(), 30 * 60_000);

// Kick off one sweep shortly after boot, then on a fixed interval.
setTimeout(() => void poll(), 10_000);
const pollTimer = setInterval(() => void poll(), POLL_INTERVAL_MS);

async function shutdown(signal: string) {
  console.log(`[DM Worker] ${signal} received, closing worker`);
  clearInterval(heartbeatTimer);
  clearInterval(pollTimer);
  clearInterval(dailyTimer);
  await worker.close();
  process.exit(0);
}

process.on("SIGINT", () => void shutdown("SIGINT"));
process.on("SIGTERM", () => void shutdown("SIGTERM"));
