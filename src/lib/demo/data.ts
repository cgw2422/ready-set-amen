
/**
 * Fictional demo content.
 *
 * Every person, phone number, email address and medical note below is invented.
 * Phone numbers use the 555-01xx range reserved for fiction, and email
 * addresses use example.com, which is reserved by RFC 2606 and cannot receive
 * mail. No real church, student or family is represented here.
 */

export type DemoFamily = {
  last: string;
  guardian: string;
  guardianRelationship: "Mother" | "Father" | "Grandmother" | "Legal Guardian";
  children: string[];
};

/** Several sibling groups, and guardians responsible for more than one child. */
export const DEMO_FAMILIES: DemoFamily[] = [
  { last: "Callahan", guardian: "Renee Callahan", guardianRelationship: "Mother", children: ["Ava", "Eli", "Nora"] },
  { last: "Okonkwo", guardian: "Chidi Okonkwo", guardianRelationship: "Father", children: ["Ada", "Ike"] },
  { last: "Delacroix", guardian: "Marisol Delacroix", guardianRelationship: "Mother", children: ["Sofia", "Mateo", "Lucia"] },
  { last: "Whitmore", guardian: "Karen Whitmore", guardianRelationship: "Mother", children: ["Grace", "Owen"] },
  { last: "Trinh", guardian: "Linh Trinh", guardianRelationship: "Mother", children: ["Anh", "Bao"] },
  { last: "Bergstrom", guardian: "Dale Bergstrom", guardianRelationship: "Father", children: ["Ruby", "Levi"] },
  { last: "Ferrara", guardian: "Pilar Ferrara", guardianRelationship: "Mother", children: ["Micah", "Nova"] },
  { last: "Ashby", guardian: "Susan Ashby", guardianRelationship: "Grandmother", children: ["Wren"] },
  { last: "Sundgren", guardian: "Jae Sundgren", guardianRelationship: "Father", children: ["Ivy", "Silas"] },
  { last: "Marchetti", guardian: "Ana Marchetti", guardianRelationship: "Mother", children: ["Cora", "Ezra"] },
  { last: "Halloway", guardian: "Bill Halloway", guardianRelationship: "Father", children: ["Judah", "Emery"] },
  { last: "Kwon", guardian: "Grace Kwon", guardianRelationship: "Mother", children: ["Talia"] },
  { last: "Brookshire", guardian: "Tanya Brookshire", guardianRelationship: "Legal Guardian", children: ["Jonah", "Sadie"] },
  { last: "Vandermeer-Castellanos", guardian: "Alejandra Vandermeer-Castellanos", guardianRelationship: "Mother", children: ["Maximiliano"] },
];

/** Students with no siblings on this trip. */
export const DEMO_SOLO_STUDENTS: { first: string; last: string; guardian: string }[] = [
  { first: "Beau", last: "Ridgeway", guardian: "Tessa Ridgeway" },
  { first: "Della", last: "Cortland", guardian: "Marcus Cortland" },
  { first: "Amos", last: "Pennington", guardian: "Joy Pennington" },
  { first: "Elise", last: "Yarborough", guardian: "Rob Yarborough" },
  { first: "Rhett", last: "Sandoval", guardian: "Camila Sandoval" },
  { first: "Marlowe", last: "Fitzgerald", guardian: "Aileen Fitzgerald" },
  { first: "Cyrus", last: "Abernathy", guardian: "Dean Abernathy" },
  { first: "Tobias", last: "Lindqvist", guardian: "Inga Lindqvist" },
  { first: "Hazel", last: "Montoya", guardian: "Rosa Montoya" },
  { first: "Asher", last: "Beaumont", guardian: "Nia Beaumont" },
  { first: "Nora", last: "Kilbride", guardian: "Sean Kilbride" },
  { first: "Josiah", last: "Ellingsworth", guardian: "Faye Ellingsworth" },
  { first: "Tess", last: "Ravensdale", guardian: "Colin Ravensdale" },
  { first: "Roman", last: "Achterberg", guardian: "Petra Achterberg" },
  { first: "Junie", last: "Stallworth", guardian: "Denise Stallworth" },
];

export const DEMO_LEADERS = [
  { first: "Dana", last: "Reyes", gender: "Female", phone: "614-555-0180", role: "Trip Leader" },
  { first: "Marcus", last: "Whitmore", gender: "Male", phone: "614-555-0181", role: "Assistant Leader" },
  { first: "Priya", last: "Raman", gender: "Female", phone: "614-555-0182", role: "Registration" },
  { first: "Tom", last: "Ashby", gender: "Male", phone: "614-555-0183", role: "Hotel Check-In" },
  { first: "Alexis", last: "Grant", gender: "Female", phone: "614-555-0184", role: "Meal Coordinator" },
  { first: "Chris", last: "Okonkwo", gender: "Male", phone: "614-555-0185", role: "Headcount Leader" },
  { first: "Renee", last: "Salas", gender: "Female", phone: "614-555-0186", role: "Emergency Contact Lead" },
  { first: "Victor", last: "Hollis", gender: "Male", phone: "614-555-0187", role: "Luggage" },
];

export const DEMO_ALLERGIES = ["Peanuts", "Bee stings", "Penicillin", "Shellfish", "Latex"];
export const DEMO_CONDITIONS = ["Asthma", "Type 1 diabetes", "Migraines", "Seasonal allergies"];
export const DEMO_MEDICATIONS = ["Rescue inhaler as needed", "Insulin pump", "Daily antihistamine"];
export const DEMO_DIETARY = ["Vegetarian", "Gluten free", "No dairy", "Nut free"];

export const DEMO_VEHICLES = [
  { name: "Church Van 1", type: "Van", capacity: 15, reservedSeats: 1, driver: "Dana Reyes" },
  { name: "Church Van 2", type: "Van", capacity: 15, reservedSeats: 1, driver: "Marcus Whitmore" },
  { name: "Rental Van", type: "Rental", capacity: 12, reservedSeats: 1, driver: "Tom Ashby" },
  { name: "Okonkwo Suburban", type: "SUV", capacity: 7, reservedSeats: 0, driver: "Chris Okonkwo" },
  { name: "Grant Family SUV", type: "SUV", capacity: 7, reservedSeats: 0, driver: "Alexis Grant" },
  { name: "Salas Minivan", type: "Car", capacity: 6, reservedSeats: 0, driver: "Renee Salas" },
  { name: "Gear Trailer Truck", type: "Other", capacity: 3, reservedSeats: 0, driver: "Victor Hollis" },
];

export const DEMO_ROOMS = [
  ...[1, 2, 3, 4, 5].map((n) => ({ name: `Room 21${n}`, designation: "FEMALE", capacity: 4, requiresLeader: n <= 2 })),
  ...[1, 2, 3, 4, 5].map((n) => ({ name: `Room 31${n}`, designation: "MALE", capacity: 4, requiresLeader: n <= 2 })),
  { name: "Room 401", designation: "FEMALE", capacity: 3, requiresLeader: false },
  { name: "Room 402", designation: "MALE", capacity: 3, requiresLeader: false },
  { name: "Room 403", designation: "ANY", capacity: 2, requiresLeader: false },
];

/** Four days, the shape a real convention trip actually takes. */
export const DEMO_ITINERARY: {
  day: number;
  start?: string;
  end?: string;
  title: string;
  location?: string;
  description?: string;
}[] = [
  { day: 0, start: "06:30", title: "Meet at Church", location: "Church parking lot", description: "Bags loaded and labelled before 7:00." },
  { day: 0, start: "07:00", title: "Load Vehicles" },
  { day: 0, start: "07:45", title: "Departure", description: "Headcount before we pull out." },
  { day: 0, start: "10:30", end: "11:15", title: "Rest Stop", location: "Mile marker 112" },
  { day: 0, start: "12:15", end: "13:15", title: "Lunch Stop", location: "Springfield" },
  { day: 0, start: "15:30", title: "Hotel Check-In", location: "Convention Inn, Columbus" },
  { day: 0, start: "17:30", end: "18:30", title: "Dinner", location: "Hotel dining room" },
  { day: 0, start: "19:00", end: "21:30", title: "Opening Session", location: "Main auditorium" },
  { day: 0, start: "23:00", title: "Hotel Curfew" },

  { day: 1, start: "07:30", end: "08:30", title: "Breakfast" },
  { day: 1, start: "09:00", end: "12:00", title: "Morning Sessions", location: "Main auditorium" },
  { day: 1, start: "12:15", end: "13:30", title: "Lunch" },
  { day: 1, start: "14:00", end: "16:30", title: "Serve Project", location: "Eastside Food Pantry" },
  { day: 1, start: "17:00", end: "18:30", title: "Free Time", location: "Hotel" },
  { day: 1, start: "19:00", end: "21:30", title: "Evening Session" },
  { day: 1, start: "23:00", title: "Hotel Curfew" },

  { day: 2, start: "07:30", end: "08:30", title: "Breakfast" },
  { day: 2, start: "09:00", end: "12:00", title: "Breakout Workshops" },
  { day: 2, start: "13:00", end: "16:00", title: "Youth Activity", location: "Riverfront park" },
  { day: 2, start: "19:00", end: "22:00", title: "Closing Night Service" },
  { day: 2, start: "23:30", title: "Hotel Curfew" },

  { day: 3, start: "07:30", title: "Breakfast and Pack" },
  { day: 3, start: "09:00", title: "Hotel Check-Out" },
  { day: 3, start: "09:30", title: "Final Headcount", description: "Every vehicle counted before departure." },
  { day: 3, start: "10:00", title: "Return Home" },
];

export const DEMO_PRAYER_FOCUSES = [
  "Safe travel there and back",
  "Unity among our students",
  "Students responding to the preaching",
  "Our leaders — energy and patience",
  "The families sending their kids with us",
];

export const DEMO_DOCUMENTS = [
  { name: "Insurance Card", description: "Photo of the front and back", required: true },
  { name: "Convention Registration", description: "Confirmation number from the convention site", required: true },
  { name: "Medical Form", description: "Church medical release on file", required: true },
  { name: "Photo Permission", description: "Optional — for the recap video", required: false },
];

export const DEMO_TASKS = [
  "Collect Waivers",
  "Collect Other Forms",
  "Collect Payments",
  "Confirm Transportation",
  "Confirm Drivers",
  "Confirm Lodging",
  "Confirm Registration",
  "Prepare Emergency Information",
  "Pack First Aid Kit",
  "Leader Meeting",
  "Prepare Snacks",
  "Final Headcount Setup",
];

export const DEMO_LEADER_ROLES = [
  { role: "Trip Leader", required: true },
  { role: "Assistant Leader", required: true },
  { role: "Registration", required: false },
  { role: "Hotel Check-In", required: false },
  { role: "Meal Coordinator", required: false },
  { role: "Headcount Leader", required: false },
  { role: "Emergency Contact Lead", required: false },
  { role: "Medication Coordinator", required: false },
];

// The demo trip is always upcoming, so its headcount history is the practice
// runs a leader does beforehand — not counts from a trip that has not happened.
export const DEMO_HEADCOUNTS = [
  { label: "Parent Meeting Check-In", daysAgo: 0, missing: 0 },
  { label: "Packing List Review", daysAgo: 0, missing: 0 },
  { label: "Practice Count", daysAgo: 0, missing: 1 },
];

export const DEMO_TRIP = {
  destination: "Columbus, OH",
  departureLocation: "Church parking lot",
  description:
    "Four days at the Ohio Youth Convention: morning sessions, an afternoon serve project, and " +
    "evening services. Demonstration data — every person and detail below is fictional.",
  costPerPerson: 95,
  depositAmount: 25,
};
