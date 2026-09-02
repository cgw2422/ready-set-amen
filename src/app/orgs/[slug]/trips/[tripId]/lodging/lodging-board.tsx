"use client";

import { useState, useTransition } from "react";
import {
  assignRoomAction,
  autoAssignRoomsAction,
  createRoomAction,
  deleteRoomAction,
  updateRoomAction,
} from "@/lib/actions/logistics";
import type { FormState } from "@/lib/actions/auth";
import {
  Alert,
  Badge,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Field,
  Input,
  Select,
  Textarea,
} from "@/components/ui";
import { AssignSheet } from "@/components/assign-sheet";

type Occupant = { id: string; name: string; isLeader: boolean; gender: string | null };

type Room = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  designation: string;
  requiresLeader: boolean;
  notes: string | null;
  occupants: Occupant[];
};

type Attendee = Occupant & { roomId: string | null };

const ROOM_TYPES = ["Hotel Room", "Cabin", "Dorm", "Host Home", "Other"];

const DESIGNATIONS = [
  { value: "ANY", label: "Any" },
  { value: "MALE", label: "Male" },
  { value: "FEMALE", label: "Female" },
];

function designationLabel(value: string): string {
  return DESIGNATIONS.find((d) => d.value === value)?.label ?? value;
}

export function LodgingBoard({
  tripId,
  rooms,
  attendees,
  startNew = false,
}: {
  tripId: string;
  rooms: Room[];
  attendees: Attendee[];
  startNew?: boolean;
}) {
  const [editing, setEditing] = useState<Room | "new" | null>(startNew ? "new" : null);
  const [assigning, setAssigning] = useState<Attendee | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [separateGenders, setSeparateGenders] = useState(true);
  const [keepFamilies, setKeepFamilies] = useState(false);
  const [reassignAll, setReassignAll] = useState(false);
  const [pending, startTransition] = useTransition();

  const unassigned = attendees.filter((a) => !a.roomId);
  const totalBeds = rooms.reduce((s, r) => s + r.capacity, 0);

  const assign = (attendeeId: string, roomId: string | null) =>
    startTransition(async () => {
      const result = await assignRoomAction(attendeeId, roomId);
      setMessage(result.error ? { tone: "error", text: result.error } : null);
      setAssigning(null);
    });

  const autoAssign = () =>
    startTransition(async () => {
      const result = await autoAssignRoomsAction(tripId, {
        separateGenders,
        keepFamiliesTogether: keepFamilies,
        reassignAll,
      });
      setMessage(
        result.error
          ? { tone: "error", text: result.error }
          : { tone: "success", text: "Rooms assigned. Move anyone you like — nothing is locked." },
      );
    });

  return (
    <div className="space-y-4">
      {message ? <Alert tone={message.tone === "error" ? "error" : "success"}>{message.text}</Alert> : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-navy">
              {attendees.length - unassigned.length} of {attendees.length} assigned
            </p>
            <p className="text-xs text-navy-faint">
              {totalBeds} spots across {rooms.length} {rooms.length === 1 ? "room" : "rooms"}
            </p>
          </div>
          <Button type="button" onClick={() => setEditing("new")}>
            Add room
          </Button>
        </div>

        {rooms.length > 0 ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="font-semibold text-navy">Auto assign</p>
            <p className="text-xs text-navy-faint">
              Leaders go into rooms that require one first, then rooms fill up rather than spreading
              thin.
            </p>
            <div className="mt-3 space-y-2">
              <label className="flex items-center gap-3 text-sm text-navy">
                <Checkbox
                  checked={separateGenders}
                  onChange={(e) => setSeparateGenders(e.currentTarget.checked)}
                />
                Keep rooms single-gender
              </label>
              <label className="flex items-center gap-3 text-sm text-navy">
                <Checkbox checked={keepFamilies} onChange={(e) => setKeepFamilies(e.currentTarget.checked)} />
                Keep families together (same last name)
              </label>
              <label className="flex items-center gap-3 text-sm text-navy">
                <Checkbox checked={reassignAll} onChange={(e) => setReassignAll(e.currentTarget.checked)} />
                Start over — reassign everyone
              </label>
            </div>
            <Button type="button" variant="secondary" className="mt-3" disabled={pending} onClick={autoAssign}>
              {pending ? "Assigning…" : "Auto assign rooms"}
            </Button>
          </div>
        ) : null}
      </Card>

      {editing ? (
        <RoomForm
          tripId={tripId}
          room={editing === "new" ? null : editing}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {rooms.length === 0 ? (
        <EmptyState
          title="No rooms yet."
          description="Add the rooms, cabins, or dorms you've booked and start placing people."
          action={<Button type="button" onClick={() => setEditing("new")}>Add a room</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {rooms.map((room) => {
            const over = room.occupants.length > room.capacity;
            const needsLeader = room.requiresLeader && room.occupants.length > 0 && !room.occupants.some((o) => o.isLeader);
            return (
              <Card as="li" key={room.id} className={`p-4 ${over ? "border-coral" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold text-navy">{room.name}</p>
                    <p className="text-sm text-navy-soft">
                      {room.type} · {designationLabel(room.designation)}
                      {room.requiresLeader ? " · leader required" : ""}
                    </p>
                    {room.notes ? <p className="mt-1 text-xs text-navy-faint">{room.notes}</p> : null}
                  </div>
                  <Badge tone={over ? "coral" : room.occupants.length === room.capacity ? "green" : "gold"}>
                    {room.occupants.length} / {room.capacity}
                  </Badge>
                </div>

                {needsLeader ? (
                  <p className="mt-2 rounded-lg bg-gold-soft px-3 py-1.5 text-xs font-semibold text-navy">
                    This room still needs an adult leader.
                  </p>
                ) : null}

                {room.occupants.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {room.occupants.map((o) => (
                      <li key={o.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() => setAssigning(attendees.find((a) => a.id === o.id) ?? null)}
                          className="min-h-[44px] rounded-full border border-line bg-cream px-3 py-1.5 text-sm text-navy"
                        >
                          {o.name}
                          {o.isLeader ? " · leader" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-navy-faint">Nobody assigned yet.</p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(room)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteRoomAction(room.id);
                        if (result.error) setMessage({ tone: "error", text: result.error });
                      })
                    }
                  >
                    Delete
                  </Button>
                </div>
              </Card>
            );
          })}
        </ul>
      )}

      <Card className="p-4">
        <p className="font-display text-base font-bold text-navy">
          Not assigned ({unassigned.length})
        </p>
        {unassigned.length === 0 ? (
          <p className="mt-1 text-sm text-green-deep">Everyone has a bed.</p>
        ) : (
          <ul className="mt-3 flex flex-wrap gap-1.5">
            {unassigned.map((a) => (
              <li key={a.id}>
                <button
                  type="button"
                  onClick={() => setAssigning(a)}
                  className="min-h-[44px] rounded-full border border-coral/40 bg-coral-soft px-3 py-1.5 text-sm font-semibold text-coral-deep"
                >
                  {a.name}
                </button>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {assigning ? (
        <AssignSheet
          title={`Where does ${assigning.name} stay?`}
          currentId={assigning.roomId}
          options={rooms.map((r) => ({
            id: r.id,
            label: r.name,
            detail: `${r.occupants.length} / ${r.capacity} · ${designationLabel(r.designation)}`,
            full: r.occupants.length >= r.capacity && assigning.roomId !== r.id,
          }))}
          onSelect={(id) => assign(assigning.id, id)}
          onClose={() => setAssigning(null)}
        />
      ) : null}
    </div>
  );
}

const initial: FormState = {};

function RoomForm({
  tripId,
  room,
  onDone,
}: {
  tripId: string;
  room: Room | null;
  onDone: () => void;
}) {
  const [state, setState] = useState<FormState>(initial);

  return (
    <Card className="p-4">
      <form
        action={async (formData) => {
          const result = room
            ? await updateRoomAction(room.id, initial, formData)
            : await createRoomAction(tripId, initial, formData);
          setState(result);
          if (!result.error) onDone();
        }}
        className="space-y-3"
      >
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <p className="font-display text-base font-bold text-navy">
          {room ? `Edit ${room.name}` : "Add a room"}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name or number" required>
            <Input name="name" required autoFocus defaultValue={room?.name} placeholder="Room 214" />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue={room?.type ?? "Hotel Room"}>
              {ROOM_TYPES.map((t) => (
                <option key={t} value={t}>
                  {t}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Capacity" required>
            <Input
              name="capacity"
              type="number"
              min={1}
              max={60}
              required
              defaultValue={room?.capacity ?? 4}
            />
          </Field>
          <Field label="Designation">
            <Select name="designation" defaultValue={room?.designation ?? "ANY"}>
              {DESIGNATIONS.map((d) => (
                <option key={d.value} value={d.value}>
                  {d.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <label className="flex items-center gap-3">
          <Checkbox name="requiresLeader" defaultChecked={room?.requiresLeader ?? false} />
          <span className="text-sm font-semibold text-navy">An adult leader must stay here</span>
        </label>

        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={room?.notes ?? ""} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit">{room ? "Save room" : "Add room"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
