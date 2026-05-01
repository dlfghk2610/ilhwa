import { AppLayout } from "@/components/AppLayout";
import { DataManager } from "@/components/DataManager";

export default function Careers() {
  return (
    <AppLayout title="PQ 개인별 경력관리">
      <DataManager
        table="personal_careers"
        exportName="PQ개인별경력"
        searchKeys={["technician_name", "company", "department"]}
        fields={[
          { key: "technician_name", label: "기술자명", required: true },
          { key: "company", label: "회사명", required: true },
          { key: "department", label: "부서" },
          { key: "position", label: "직위" },
          { key: "hire_date", label: "입사일", type: "date" },
          { key: "resign_date", label: "퇴사일", type: "date" },
          { key: "duties", label: "담당업무", type: "textarea" },
          { key: "notes", label: "비고", type: "textarea" },
        ]}
      />
    </AppLayout>
  );
}
