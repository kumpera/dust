import type { UserTypeWithWorkspaces, WorkspaceType } from "@dust-tt/types";
import { MEMBERSHIP_ROLE_TYPES } from "@dust-tt/types";
import { useRouter } from "next/router";

import type { MemberDisplayType } from "@app/components/poke/members/columns";
import { makeColumnsForMembers } from "@app/components/poke/members/columns";
import { PokeDataTable } from "@app/components/poke/shadcn/ui/data_table";

function prepareMembersForDisplay(
  members: UserTypeWithWorkspaces[]
): MemberDisplayType[] {
  return members.map((m) => {
    return {
      createdAt: m.createdAt,
      email: m.email,
      name: m.fullName,
      provider: m.provider,
      role: m.workspaces[0].role,
      sId: m.sId,
    };
  });
}

interface MembersDataTableProps {
  members: UserTypeWithWorkspaces[];
  owner: WorkspaceType;
}

export function MembersDataTable({ members, owner }: MembersDataTableProps) {
  const router = useRouter();

  const onRevokeMember = async (m: MemberDisplayType) => {
    if (!window.confirm(`Are you sure you want to revoke ${m.email}?`)) {
      return;
    }

    try {
      const r = await fetch(`/api/poke/workspaces/${owner.sId}/revoke`, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId: m.sId,
        }),
      });
      if (!r.ok) {
        throw new Error("Failed to revoke user.");
      }
      router.reload();
    } catch (e) {
      console.error(e);
      window.alert("An error occurred while revoking the user.");
    }
  };

  return (
    <div className="border-material-200 my-4 flex w-full flex-col rounded-lg border p-4">
      <h2 className="text-md mb-4 font-bold">Members:</h2>
      <PokeDataTable
        columns={makeColumnsForMembers({ onRevokeMember })}
        data={prepareMembersForDisplay(members)}
        facets={[
          {
            columnId: "role",
            title: "Role",
            options: [...MEMBERSHIP_ROLE_TYPES, "none"].map((r) => ({
              label: r,
              value: r,
            })),
          },
        ]}
      />
    </div>
  );
}
