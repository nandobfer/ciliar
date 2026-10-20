import { createHash } from "node:crypto"
import { readFileSync } from "node:fs"
import { describe, expect, it } from "vitest"

// SHA-256 dos originais, conferidos em 18/10/2026. Independente dos repositórios de referência no CI.
const originals: Record<string, string> = {
    "src/components/list/ActiveFilterChips.tsx": "329d12ea1b9ed70ae7544085bac6ffad12422234d24b5849ee1068bc0eb3d558",
    "src/components/list/CadastroFilterCard.tsx": "37744674b45b738f8911830d27b0ef04a45b150bfd8bc65dfe5e9f0787e24e14",
    "src/components/list/CadastroHeader.tsx": "afcc9bf8b71abc37617ba002e172965ec97cbf772905439afdaa4fd3a6caf1a7",
    "src/components/list/CadastroMultiSelect.tsx": "ebb1351f1c952799376b040ad6f94bd790e8ef7dd29d9ae9dc6cc749954c4f51",
    "src/components/list/CadastroTableCard.tsx": "efdfa820ec7da10a1e42a0e688e49cd0e35f5d8176a976d8965b45435c03a16e",
    "src/components/list/CadastroTableSkeleton.tsx": "16fe66de4ae4859016e4a20745e9583618ac5d00b91dc8077f6ef68da5a1c029",
    "src/components/list/ChipOverflowList.tsx": "46cc64f7877e29846ea7695e0fce4ab1fc91241fe2cdf14a42bccc5faa65bbe5",
    "src/components/list/FilterGroup.tsx": "4f127e5154457d8e2183aad563915ac66fbdbecc359508d1465940e1dafd476e",
    "src/components/list/ListFilters.tsx": "f00aa5b2583d36121285aa64557a6ae7d811a46127bf1e53e97f696a8b2c9c23",
    "src/components/list/StatusFilterMultiSelect.tsx": "f3e7225f2503d95d777e46b1aa1d61751dbb7e1cc4facc92167179f3d1bb70f4",
    "src/components/list/StatusPill.tsx": "bbacbf8074ffb6e9754db28a1a7ccefecf1f3423940172a3cbf8ae182882d1a4",
    "src/components/list/TabFooter.tsx": "633366e7254c7f48251ab1b884423459bf834d11fb9bebfb389a3ccaf7fb98d0",
    "src/components/list/TableAction.tsx": "1b01f08285efd8347c6d174763bbe532278660841c3b60ad18cfcf8c1ef29cac",
    "src/features/view-as/components/ViewAsBanner.tsx": "e896a4b9522d72632653c4c076c311868e69cb51c2c09082c488dce3fa4bdf65",
    "src/features/view-as/components/ViewAsStepHeader.tsx": "1218d8f8525ddb27a4cc49472b161a463258f23c43ee28a19556581b88d11ed3",
    "src/features/view-as/components/ViewAsSelector.tsx": "7b798e2a65c40ba0f508154e4f0bd3f4791f565f3f1418971655d735e49a5eb4",
    "src/features/view-as/components/ViewAsRoleStep.tsx": "f255d6224edd6e0686858d2091bb2e0df654913d623c0d415b6b7708555ee4b9",
    "src/features/view-as/components/ViewAsUserStep.tsx": "4cb4b0ea9b909949c5ef40fae73b6ec39b44bacdaaae0c8b4cf9f88c6326e7f3",
}
describe("cópia fiel dos componentes originais", () => {
    it.each(Object.entries(originals))("preserva %s", (path, expected) => {
        let source = readFileSync(path, "utf8")
        if (path.includes("/view-as/")) source = source.replace(/^"use client"\n\n/, "")
            .replaceAll("@/features/access/components/permissions/RoleChip", "@/features/roles/components/permissions/RoleChip")
            .replace('from "./EmptyState"', 'from "@/components/feedback/EmptyState"')
        expect(createHash("sha256").update(source).digest("hex")).toBe(expected)
    })
})
