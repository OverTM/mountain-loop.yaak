import { revealItemInDir } from "@tauri-apps/plugin-opener";
import { settingsAtom } from "@yaakapp-internal/models";
import { Heading, VStack } from "@yaakapp-internal/ui";
import { useAtomValue } from "jotai";
import { appInfo } from "../../lib/appInfo";
import { revealInFinderText } from "../../lib/reveal";
import { DismissibleBanner } from "../core/DismissibleBanner";
import {
  SettingValue,
  SettingRow,
  SettingsList,
  SettingsSection,
} from "../core/SettingRow";

const WORKSPACE_SETTINGS_MOVED_AT = "2026-06-30";

export function SettingsGeneral() {
  const settings = useAtomValue(settingsAtom);

  if (settings == null) {
    return null;
  }

  const showWorkspaceSettingsMovedBanner =
    settings.createdAt.slice(0, 10) < WORKSPACE_SETTINGS_MOVED_AT;

  return (
    <VStack space={1.5} className="mb-4">
      <div>
        <Heading>General</Heading>
        <p className="text-text-subtle">
          Configure general settings for the application.
        </p>
      </div>
      <SettingsList className="space-y-8">
        {showWorkspaceSettingsMovedBanner && (
          <DismissibleBanner
            id="workspace-settings-moved-2026-06-30"
            color="info"
            className="w-full p-4 max-w-xl mr-auto"
          >
            <p>
              Workspace specific settings have moved to{" "}
              <b>Workspace Settings</b>, accessible from the workspace switcher
              menu.
            </p>
          </DismissibleBanner>
        )}

        <SettingsSection title="App Info">
          <SettingRow title="Version" description="Current Yaak version.">
            <SettingValue value={appInfo.version} />
          </SettingRow>
          <SettingRow
            title="Data Directory"
            description="Where Yaak stores application data."
            controlClassName="min-w-0 max-w-[min(42rem,55vw)] gap-2"
          >
            <SettingValue
              value={appInfo.appDataDir}
              actions={[
                {
                  title: revealInFinderText,
                  icon: "folder_open",
                  onClick: () => revealItemInDir(appInfo.appDataDir),
                },
              ]}
            />
          </SettingRow>
          <SettingRow
            title="Logs Directory"
            description="Where Yaak writes application logs."
            controlClassName="min-w-0 max-w-[min(42rem,55vw)] gap-2"
          >
            <SettingValue
              value={appInfo.appLogDir}
              actions={[
                {
                  title: revealInFinderText,
                  icon: "folder_open",
                  onClick: () => revealItemInDir(appInfo.appLogDir),
                },
              ]}
            />
          </SettingRow>
        </SettingsSection>
      </SettingsList>
    </VStack>
  );
}
