import { adminFailure, adminJson, authorizeMutation, readAdminJson } from "@/lib/admin/http";
import { requireOwner } from "@/lib/admin/session";
import { allocationSaveSchema } from "@/lib/orders/allocation";
import { readAllocationDayMap, readAllocationMap, saveBranchAllocations } from "@/lib/orders/store";

export async function GET() {
  try {
    await requireOwner();
    const [allocations, pauses] = await Promise.all([readAllocationMap(), readAllocationDayMap()]);
    return adminJson({ allocations: [...allocations.values()], pauses: [...pauses.values()] });
  } catch (error) {
    return adminFailure(error);
  }
}

export async function POST(request: Request) {
  try {
    const owner = await authorizeMutation(request);
    const saved = await saveBranchAllocations(allocationSaveSchema.parse(await readAdminJson(request)), owner.uid);
    return adminJson({ allocations: [...saved.allocations.values()], pauses: [...saved.pauses.values()] });
  } catch (error) {
    return adminFailure(error);
  }
}
