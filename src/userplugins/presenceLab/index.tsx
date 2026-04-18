import { ComponentsIcon } from "@components/Icons";
import SettingsPlugin from "@plugins/_core/settings";
import { Devs } from "@utils/constants";
import { removeFromArray } from "@utils/misc";
import definePlugin from "@utils/types";

import PresenceLabTab from "./PresenceLabTab";

const PRESENCE_LAB_SETTINGS_KEY = "kamidere_presence_lab";
const PRESENCE_LAB_SETTINGS_SECTION = "KamiderePresenceLab";

function unregisterPresenceLabSettingsTab() {
    while (SettingsPlugin.customEntries.some(entry => entry.key === PRESENCE_LAB_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.customEntries, entry => entry.key === PRESENCE_LAB_SETTINGS_KEY);
    }

    while (SettingsPlugin.settingsSectionMap.some(entry => entry[1] === PRESENCE_LAB_SETTINGS_KEY)) {
        removeFromArray(SettingsPlugin.settingsSectionMap, entry => entry[1] === PRESENCE_LAB_SETTINGS_KEY);
    }

    SettingsPlugin.invalidateSectionLayout();
}

function registerPresenceLabSettingsTab() {
    unregisterPresenceLabSettingsTab();

    SettingsPlugin.customEntries.push({
        key: PRESENCE_LAB_SETTINGS_KEY,
        title: "Presence Lab",
        Component: PresenceLabTab,
        Icon: ComponentsIcon,
    });

    SettingsPlugin.settingsSectionMap.push([PRESENCE_LAB_SETTINGS_SECTION, PRESENCE_LAB_SETTINGS_KEY]);
    SettingsPlugin.invalidateSectionLayout();
}

export default definePlugin({
    name: "PresenceLab",
    description: "Local-only dashboard for operators, targets, and manually logged experimental presence sessions.",
    authors: [Devs.clrxxo],
    enabledByDefault: true,
    tags: ["kamidere", "dashboard", "experimental"],
    requiresRestart: false,
    settingsTab: {
        route: `${PRESENCE_LAB_SETTINGS_KEY}_panel`,
        title: "Presence Lab",
    },

    start() {
        registerPresenceLabSettingsTab();
    },

    stop() {
        unregisterPresenceLabSettingsTab();
    },
});
