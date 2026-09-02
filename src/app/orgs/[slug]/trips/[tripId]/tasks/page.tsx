import Link from "next/link";
import { prisma } from "@/lib/db";
import { requireTrip } from "@/lib/access";
import { loadTripReadiness } from "@/lib/trip-data";
import { Card } from "@/components/ui";
import { TaskList } from "./task-list";
import { AddTaskForm } from "./add-task-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "Tasks" };

export default async function TasksPage({
  params,
  searchParams,
}: {
  params: Promise<{ slug: string; tripId: string }>;
  searchParams: Promise<{ new?: string }>;
}) {
  const { slug, tripId } = await params;
  // Arriving from the Quick Actions "+" opens the form already focused.
  const { new: startNew } = await searchParams;
  await requireTrip(tripId);
  const base = `/orgs/${slug}/trips/${tripId}`;

  const [tasks, { readiness }] = await Promise.all([
    prisma.task.findMany({
      where: { tripId },
      orderBy: [{ isPrayerStep: "asc" }, { sortOrder: "asc" }],
    }),
    loadTripReadiness(tripId),
  ]);

  const prayerTask = tasks.find((t) => t.isPrayerStep) ?? null;
  const workTasks = tasks.filter((t) => !t.isPrayerStep);
  const done = workTasks.filter((t) => t.status === "DONE").length;

  return (
    <div className="space-y-5">
      <div>
        <h1 className="font-display text-2xl font-extrabold text-navy">Preparation</h1>
        <p className="text-sm text-navy-soft">
          {done} of {workTasks.length} done
        </p>
      </div>

      <TaskList
        tasks={workTasks.map((t) => ({
          id: t.id,
          title: t.title,
          description: t.description,
          status: t.status,
          dueDate: t.dueDate ? t.dueDate.toISOString() : null,
          isDefault: t.isDefault,
        }))}
      />

      <AddTaskForm tripId={tripId} startOpen={startNew === "1"} />

      {/* The prayer step sits apart from the checklist on purpose. */}
      <Card className="border-gold/40 bg-gold-soft p-5">
        <p className="text-xs font-bold uppercase tracking-wide text-gold-deep">
          The final preparation step
        </p>
        <p className="mt-1 font-display text-xl font-extrabold text-navy">
          {prayerTask?.title ?? "Pray Over The Group"}
        </p>
        <p className="mt-2 text-sm text-navy-soft">
          {prayerTask?.description ??
            "Take time with your leaders to pray over every person, the travel, the services, the ministry, and what God wants to accomplish through this trip."}
        </p>
        <p className="mt-3 text-sm font-semibold text-navy">
          {readiness.prayerComplete
            ? "Completed. Ready. Set. Amen."
            : readiness.logisticsComplete
              ? "You've checked the boxes. Now let's cover the trip in prayer."
              : "Not yet — and that's fine. Pray whenever your team is ready."}
        </p>
        <Link
          href={`${base}/prayer`}
          className="mt-4 inline-flex min-h-[44px] items-center rounded-xl bg-green-brand px-4 font-semibold text-white"
        >
          {readiness.prayerComplete ? "Open prayer" : "Pray over the group"}
        </Link>
      </Card>
    </div>
  );
}
