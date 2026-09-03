/**
 * The task list every new trip starts with.
 *
 * Deliberately not in a "use server" module: those may export nothing but async
 * functions, and Next only discovers the violation at runtime — every action in
 * the offending file then throws, which reads as an unrelated page crashing.
 */
export const DEFAULT_TASKS: { title: string; description?: string; isPrayerStep?: boolean }[] = [
  { title: "Collect Waivers" },
  { title: "Collect Other Forms" },
  { title: "Collect Payments" },
  { title: "Confirm Transportation" },
  { title: "Confirm Drivers" },
  { title: "Confirm Lodging" },
  { title: "Confirm Registration" },
  { title: "Prepare Emergency Information" },
  { title: "Pack First Aid Kit" },
  { title: "Leader Meeting" },
  { title: "Prepare Snacks" },
  { title: "Final Headcount Setup" },
  {
    title: "Pray Over The Group",
    description:
      "Take time with your leaders to pray over every person, the travel, the services, the ministry, and what God wants to accomplish through this trip.",
    isPrayerStep: true,
  },
];
