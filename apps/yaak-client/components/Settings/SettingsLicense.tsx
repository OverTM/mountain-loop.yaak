import { openUrl } from "@tauri-apps/plugin-opener";
import { useLicense } from "@yaakapp-internal/license";
import { Banner, HStack, Icon } from "@yaakapp-internal/ui";
import { Button } from "../core/Button";

export function SettingsLicense() {
  const { deactivate } = useLicense();

  return (
    <div className="flex flex-col gap-6 max-w-xl">
      <Banner color="success">Your license is active 🥳</Banner>

      <HStack space={2}>
        <Button variant="border" color="secondary" size="sm" onClick={() => deactivate.mutate()}>
          Deactivate License
        </Button>
        <Button
          color="secondary"
          size="sm"
          onClick={() => openUrl("https://yaak.app/dashboard?intent=app.license.support")}
          rightSlot={<Icon icon="external_link" />}
        >
          Direct Support
        </Button>
      </HStack>
    </div>
  );
}
