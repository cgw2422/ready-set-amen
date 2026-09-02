"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { prisma } from "@/lib/db";
import { canManageOrg, requireOrg } from "@/lib/access";
import type { FormState } from "@/lib/actions/auth";

const schema = z.object({
  name: z.string().trim().min(2, "Enter your church or organization name").max(120),
  city: z.string().trim().max(80).optional(),
  state: z.string().trim().max(40).optional(),
});

export async function updateOrganizationAction(
  slug: string,
  _prev: FormState,
  formData: FormData,
): Promise<FormState> {
  const ctx = await requireOrg(slug);
  if (!canManageOrg(ctx.role)) {
    return { error: "Only an owner or admin can change these details." };
  }

  const parsed = schema.safeParse({
    name: formData.get("name"),
    city: formData.get("city") ?? undefined,
    state: formData.get("state") ?? undefined,
  });
  if (!parsed.success) {
    return { error: parsed.error.issues[0]?.message ?? "Please check the form." };
  }

  await prisma.organization.update({
    where: { id: ctx.organization.id },
    data: {
      name: parsed.data.name,
      city: parsed.data.city || null,
      state: parsed.data.state || null,
    },
  });

  revalidatePath(`/orgs/${slug}/settings`);
  return { ok: true };
}
