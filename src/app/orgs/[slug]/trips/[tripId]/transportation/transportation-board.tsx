"use client";

import { useState, useTransition } from "react";
import {
  assignVehicleAction,
  autoAssignVehiclesAction,
  createVehicleAction,
  deleteVehicleAction,
  updateVehicleAction,
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

type Person = { id: string; name: string; isLeader: boolean; isMinor: boolean };

type Vehicle = {
  id: string;
  name: string;
  type: string;
  capacity: number;
  reservedSeats: number;
  notes: string | null;
  driverAttendeeId: string | null;
  secondaryDriverAttendeeId: string | null;
  driverName: string | null;
  driverPhone: string | null;
  driverLabel: string | null;
  secondaryDriverLabel: string | null;
  passengers: Person[];
};

type Attendee = Person & { vehicleId: string | null };

const VEHICLE_TYPES = ["Van", "Bus", "SUV", "Car", "Rental", "Other"];

export function TransportationBoard({
  tripId,
  vehicles,
  attendees,
  startNew = false,
}: {
  tripId: string;
  vehicles: Vehicle[];
  attendees: Attendee[];
  startNew?: boolean;
}) {
  const [editing, setEditing] = useState<Vehicle | "new" | null>(startNew ? "new" : null);
  const [assigning, setAssigning] = useState<Attendee | null>(null);
  const [message, setMessage] = useState<{ tone: "error" | "success"; text: string } | null>(null);
  const [keepFamilies, setKeepFamilies] = useState(true);
  const [reassignAll, setReassignAll] = useState(false);
  const [pending, startTransition] = useTransition();

  const unassigned = attendees.filter((a) => !a.vehicleId);
  const totalSeats = vehicles.reduce((s, v) => s + Math.max(0, v.capacity - v.reservedSeats), 0);

  const assign = (attendeeId: string, vehicleId: string | null) =>
    startTransition(async () => {
      const result = await assignVehicleAction(attendeeId, vehicleId);
      setMessage(result.error ? { tone: "error", text: result.error } : null);
      setAssigning(null);
    });

  const autoAssign = () =>
    startTransition(async () => {
      const result = await autoAssignVehiclesAction(tripId, {
        keepFamiliesTogether: keepFamilies,
        reassignAll,
      });
      setMessage(
        result.error
          ? { tone: "error", text: result.error }
          : { tone: "success", text: "Seats assigned. Move anyone you like — nothing is locked." },
      );
    });

  return (
    <div className="space-y-4">
      {message ? <Alert tone={message.tone === "error" ? "error" : "success"}>{message.text}</Alert> : null}

      <Card className="p-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <p className="font-display text-base font-bold text-navy">
              {attendees.length - unassigned.length} of {attendees.length} seated
            </p>
            <p className="text-xs text-navy-faint">
              {totalSeats} seats across {vehicles.length} {vehicles.length === 1 ? "vehicle" : "vehicles"}
            </p>
          </div>
          <Button type="button" onClick={() => setEditing("new")}>
            Add vehicle
          </Button>
        </div>

        {vehicles.length > 0 ? (
          <div className="mt-4 border-t border-line pt-4">
            <p className="font-semibold text-navy">Auto assign</p>
            <p className="text-xs text-navy-faint">
              Straightforward rules, no guessing: drivers keep their own vehicle, each van gets a
              leader, then everyone else fills the roomiest vehicle first.
            </p>
            <div className="mt-3 space-y-2">
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
              {pending ? "Assigning…" : "Auto assign vehicles"}
            </Button>
          </div>
        ) : null}
      </Card>

      {editing ? (
        <VehicleForm
          tripId={tripId}
          vehicle={editing === "new" ? null : editing}
          attendees={attendees}
          onDone={() => setEditing(null)}
        />
      ) : null}

      {vehicles.length === 0 ? (
        <EmptyState
          title="No vehicles yet."
          description="Add your church vans, buses, or cars and start assigning riders."
          action={<Button type="button" onClick={() => setEditing("new")}>Add a vehicle</Button>}
        />
      ) : (
        <ul className="space-y-3">
          {vehicles.map((vehicle) => {
            const usable = Math.max(0, vehicle.capacity - vehicle.reservedSeats);
            const over = vehicle.passengers.length > usable;
            return (
              <Card as="li" key={vehicle.id} className={`p-4 ${over ? "border-coral" : ""}`}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-display text-lg font-bold text-navy">{vehicle.name}</p>
                    <p className="text-sm text-navy-soft">
                      {vehicle.type} · driver{" "}
                      {vehicle.driverLabel ?? (
                        <span className="font-semibold text-coral-deep">not set</span>
                      )}
                      {vehicle.secondaryDriverLabel ? ` · backup ${vehicle.secondaryDriverLabel}` : ""}
                    </p>
                    {vehicle.notes ? (
                      <p className="mt-1 text-xs text-navy-faint">{vehicle.notes}</p>
                    ) : null}
                  </div>
                  <div className="text-right">
                    <Badge tone={over ? "coral" : vehicle.passengers.length === usable ? "green" : "gold"}>
                      {vehicle.passengers.length} / {usable} seats
                    </Badge>
                    {vehicle.reservedSeats > 0 ? (
                      <p className="mt-1 text-xs text-navy-faint">
                        {vehicle.reservedSeats} reserved
                      </p>
                    ) : null}
                  </div>
                </div>

                {vehicle.passengers.length > 0 ? (
                  <ul className="mt-3 flex flex-wrap gap-1.5">
                    {vehicle.passengers.map((p) => (
                      <li key={p.id}>
                        <button
                          type="button"
                          disabled={pending}
                          onClick={() =>
                            setAssigning(attendees.find((a) => a.id === p.id) ?? null)
                          }
                          className="min-h-[44px] rounded-full border border-line bg-cream px-3 py-1.5 text-sm text-navy"
                        >
                          {p.name}
                          {p.isLeader ? " ·  leader" : ""}
                        </button>
                      </li>
                    ))}
                  </ul>
                ) : (
                  <p className="mt-3 text-sm text-navy-faint">Nobody assigned yet.</p>
                )}

                <div className="mt-3 flex gap-2">
                  <Button type="button" variant="secondary" size="sm" onClick={() => setEditing(vehicle)}>
                    Edit
                  </Button>
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    disabled={pending}
                    onClick={() =>
                      startTransition(async () => {
                        const result = await deleteVehicleAction(vehicle.id);
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
          <p className="mt-1 text-sm text-green-deep">Everyone has a seat.</p>
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
          title={`Where does ${assigning.name} ride?`}
          currentId={assigning.vehicleId}
          options={vehicles.map((v) => ({
            id: v.id,
            label: v.name,
            detail: `${v.passengers.length} / ${Math.max(0, v.capacity - v.reservedSeats)} seats`,
            full:
              v.passengers.length >= Math.max(0, v.capacity - v.reservedSeats) &&
              assigning.vehicleId !== v.id,
          }))}
          onSelect={(id) => assign(assigning.id, id)}
          onClose={() => setAssigning(null)}
        />
      ) : null}
    </div>
  );
}

const initial: FormState = {};

function VehicleForm({
  tripId,
  vehicle,
  attendees,
  onDone,
}: {
  tripId: string;
  vehicle: Vehicle | null;
  attendees: Attendee[];
  onDone: () => void;
}) {
  const [state, setState] = useState<FormState>(initial);

  return (
    <Card className="p-4">
      <form
        action={async (formData) => {
          const result = vehicle
            ? await updateVehicleAction(vehicle.id, initial, formData)
            : await createVehicleAction(tripId, initial, formData);
          setState(result);
          if (!result.error) onDone();
        }}
        className="space-y-3"
      >
        {state.error ? <Alert tone="error">{state.error}</Alert> : null}
        <p className="font-display text-base font-bold text-navy">
          {vehicle ? `Edit ${vehicle.name}` : "Add a vehicle"}
        </p>

        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Name" required>
            <Input name="name" required autoFocus defaultValue={vehicle?.name} placeholder="Church Van 1" />
          </Field>
          <Field label="Type">
            <Select name="type" defaultValue={vehicle?.type ?? "Van"}>
              {VEHICLE_TYPES.map((t) => (
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
              max={120}
              required
              defaultValue={vehicle?.capacity ?? 15}
            />
          </Field>
          <Field label="Reserved seats" hint="Luggage, gear, or seats held back.">
            <Input
              name="reservedSeats"
              type="number"
              min={0}
              max={120}
              defaultValue={vehicle?.reservedSeats ?? 0}
            />
          </Field>
          <Field label="Driver">
            <Select name="driverAttendeeId" defaultValue={vehicle?.driverAttendeeId ?? ""}>
              <option value="">Someone not on the roster</option>
              {attendees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Backup driver">
            <Select
              name="secondaryDriverAttendeeId"
              defaultValue={vehicle?.secondaryDriverAttendeeId ?? ""}
            >
              <option value="">None</option>
              {attendees.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.name}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Driver name" hint="If they aren't on the roster.">
            <Input name="driverName" defaultValue={vehicle?.driverName ?? ""} />
          </Field>
          <Field label="Driver phone">
            <Input name="driverPhone" type="tel" inputMode="tel" defaultValue={vehicle?.driverPhone ?? ""} />
          </Field>
        </div>

        <Field label="Notes">
          <Textarea name="notes" rows={2} defaultValue={vehicle?.notes ?? ""} />
        </Field>

        <div className="flex gap-2">
          <Button type="submit">{vehicle ? "Save vehicle" : "Add vehicle"}</Button>
          <Button type="button" variant="ghost" onClick={onDone}>
            Cancel
          </Button>
        </div>
      </form>
    </Card>
  );
}
