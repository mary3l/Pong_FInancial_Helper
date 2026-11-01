import { ComingSoon } from "@/components/coming-soon";
import { MoneyTabs } from "../money-tabs";

export const metadata = { title: "Utang & pautang · Pong Money" };

export default function PeoplePage() {
  return (
    <div className="flex flex-col gap-4 lg:max-w-3xl">
      <MoneyTabs current="people" />
      <ComingSoon
        title="Utang & pautang"
        message="Track who owes you and who you owe, and split bills with friends."
        phase="Phase 4"
      />
    </div>
  );
}
