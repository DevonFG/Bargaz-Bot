import fs from "fs";

import {
    beginShutdown,
    addShutdownBlocker,
    removeShutdownBlocker,
    cancelShutdown
} from "./shutdownCoordinator.js";

const UPS_STATUS_FILE = "/home/devon/ups/ups_status.json";

const SHUTDOWN_REQUEST_FILE =
    "/home/devon/ups/shutdown_request.json";

const CHECK_INTERVAL_MS = 5 * 1000;
const BATTERY_UPDATE_INTERVAL_MS = 15 * 60 * 1000;

let previousPowerSource = null;
let previousShutdownPending = false;
let lastBatteryUpdate = null;
let checkInProgress = false;


function readUpsStatus() {
    try {
        const raw = fs.readFileSync(UPS_STATUS_FILE, "utf8");
        return JSON.parse(raw);
    } catch (error) {
        console.error("Unable to read UPS status:", error);
        return null;
    }
}

function readShutdownRequest() {
    try {
        if (!fs.existsSync(SHUTDOWN_REQUEST_FILE)) {
            return null;
        }

        const raw = fs.readFileSync(
            SHUTDOWN_REQUEST_FILE,
            "utf8"
        );

        return JSON.parse(raw);

    } catch (error) {
        console.error(
            "Unable to read shutdown request:",
            error
        );

        return null;
    }
}

async function sendOrEditUpsMessage(channel, client, content, alwaysNew = false) {
    try {
        if (!alwaysNew) {
            const messages = await channel.messages.fetch({ limit: 1 });
            const latestMessage = messages.first();

            if (
                latestMessage &&
                latestMessage.author.id === client.user.id
            ) {
                await latestMessage.edit(content);
                return;
            }
        }

        await channel.send(content);

    } catch (error) {
        console.error("Unable to send/edit UPS Discord message:", error);
    }
}


function batteryMessage(percent) {
    const battery =
        typeof percent === "number"
            ? `${percent.toFixed(1)}%`
            : "Unknown";

    return (
        "🟡 **BargazBot is running on battery power.**\n" +
        `Battery remaining: **${battery}**\n\n` +
        "The UPS can run BargazBot for roughly **12 hours from 100% " +
        "until the 30% automatic-shutdown threshold**. " +
        "The Raspberry Pi will automatically shut down at **30%**."
    );
}


function externalMessage() {
    return (
        "🟢 **BargazBot is running on external power.**\n" +
        "If it looses power, this message will update "+
        "with the relevant information."
    );
}


function shutdownMessage(status, shutdownRequest) {
    const battery =
        typeof status.battery_percent === "number"
            ? `${status.battery_percent.toFixed(1)}%`
            : "Unknown";

    let reason = shutdownRequest?.shutdown_reason;

    if (reason === "low_battery") {
        reason = "Low battery";
    } else if (reason === "manual") {
        reason = "Manual shutdown";
    } else if (!reason) {
        reason = "Shutdown requested";
    }

    return (
        "🔴 **BargazBot is about to shut down.**\n" +
        `Battery remaining: **${battery}**\n` +
        `Reason: **${reason}**\n\n` +
        "The Raspberry Pi automatically shuts down when the UPS " +
        "reaches the **30% battery threshold**. Sorry for any "+
        "inconveniences this may cause."
    );
}


export async function startUpsNotifier(client) {
    const channelId =
        process.env.OWNER_STATUS_CHANNEL;

    if (!channelId) {
        console.error(
            "OWNER_STATUS_CHANNEL is not set. " +
            "UPS Discord notifications are disabled."
        );
        return;
    }

    let channel;

    try {
        channel = await client.channels.fetch(channelId);
    } catch (error) {
        console.error(
            "Unable to fetch UPS announcement channel:",
            error
        );
        return;
    }

    if (!channel || !channel.isTextBased()) {
        console.error(
            "UPS announcement channel is not a text channel."
        );
        return;
    }

    console.log("UPS Discord notifier started.");

    async function checkUps() {
        if (checkInProgress) {
            return;
        }

        checkInProgress = true;

        try {
            const status = readUpsStatus();

            if (!status) {
                return;
            }

            const shutdownRequest = readShutdownRequest();

            const powerSource = status.power_source;
            const shutdownPending =
                shutdownRequest?.shutdown_pending === true;

            const now = Date.now();

            /*
             * Shutdown notifications ALWAYS create a new message.
             *
             * Only send once when shutdown_pending changes
             * from false to true.
             */
            if (
    shutdownPending &&
    !previousShutdownPending
) {
    const requestId = shutdownRequest?.shutdown_request_id;

    if (!requestId) {
        console.error(
            "Shutdown requested without shutdown_request_id."
        );

        previousShutdownPending = true;
        previousPowerSource = powerSource;
        return;
    }

    beginShutdown(requestId);

    addShutdownBlocker(
        "discord-shutdown-notification"
    );

    try {
        await channel.send(
            shutdownMessage(status, shutdownRequest)
        );

        console.log(
            "Shutdown Discord notification sent."
        );

        removeShutdownBlocker(
            "discord-shutdown-notification"
        );

    } catch (error) {
        console.error(
            "Shutdown Discord notification failed:",
            error
        );

        /*
         * Deliberately DO NOT remove the blocker.
         *
         * The shutdown must not be declared ready
         * if Discord notification failed.
         */
    }

    previousShutdownPending = true;
    previousPowerSource = powerSource;
    return;
}

            /*
             * If shutdown_pending goes back to false,
             * remember that change.
             */
            if (
                !shutdownPending &&
                previousShutdownPending
            ) {
                cancelShutdown();
                previousShutdownPending = false;
            }

            /*
             * Don't send normal power messages while
             * shutdown is pending.
             */
            if (shutdownPending) {
                previousPowerSource = powerSource;
                return;
            }

            /*
             * First reading after BargazBot starts.
             *
             * Establish the current state without sending
             * an unnecessary Discord message.
             */
            if (previousPowerSource === null) {
                previousPowerSource = powerSource;

                if (powerSource === "battery") {
                    lastBatteryUpdate = now;
                }

                return;
            }

            /*
             * External -> Battery
             *
             * Send immediately.
             */
            if (
                powerSource === "battery" &&
                previousPowerSource !== "battery"
            ) {
                await sendOrEditUpsMessage(
                    channel,
                    client,
                    batteryMessage(status.battery_percent)
                );

                lastBatteryUpdate = now;
            }

            /*
             * Battery -> External
             *
             * Send immediately.
             */
            else if (
                powerSource === "external" &&
                previousPowerSource !== "external"
            ) {
                await sendOrEditUpsMessage(
                    channel,
                    client,
                    externalMessage()
                );

                lastBatteryUpdate = null;
            }

            /*
             * Still on battery.
             *
             * Update Discord every 15 minutes.
             */
            else if (
                powerSource === "battery" &&
                (
                    lastBatteryUpdate === null ||
                    now - lastBatteryUpdate >=
                        BATTERY_UPDATE_INTERVAL_MS
                )
            ) {
                await sendOrEditUpsMessage(
                    channel,
                    client,
                    batteryMessage(status.battery_percent)
                );

                lastBatteryUpdate = now;
            }

            previousPowerSource = powerSource;

        } catch (error) {
            console.error(
                "UPS notifier check failed:",
                error
            );
        } finally {
            checkInProgress = false;
        }
    }

    /*
     * Establish initial UPS state immediately.
     */
    await checkUps();

    /*
     * Check the UPS status file every 5 seconds.
     *
     * This lets power-source and shutdown changes
     * trigger quickly, while ordinary battery updates
     * are limited to every 15 minutes.
     */
    setInterval(checkUps, CHECK_INTERVAL_MS);
}
