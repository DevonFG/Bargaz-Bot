import fs from "fs";

const READY_FILE = "/home/devon/ups/shutdown_ready.json";

let shutdownRequested = false;
let shutdownRequestId = null;

const blockers = new Set();


export function isShutdownRequested() {
    return shutdownRequested;
}


export function beginShutdown(requestId) {
    if (!requestId) {
        console.error("Shutdown request has no request ID.");
        return false;
    }

    if (
        shutdownRequested &&
        shutdownRequestId === requestId
    ) {
        return true;
    }

    shutdownRequested = true;
    shutdownRequestId = requestId;

    blockers.clear();

    console.log(
        `Graceful shutdown requested: ${requestId}`
    );

    return true;
}


export function addShutdownBlocker(name) {
    if (!shutdownRequested) {
        return;
    }

    blockers.add(name);

    console.log(
        `Shutdown blocker added: ${name}`
    );
}


export function removeShutdownBlocker(name) {
    blockers.delete(name);

    console.log(
        `Shutdown blocker cleared: ${name}`
    );

    checkShutdownReady();
}


export function getShutdownBlockers() {
    return [...blockers];
}


export function cancelShutdown() {
    console.log("Graceful shutdown cancelled.");

    shutdownRequested = false;
    shutdownRequestId = null;
    blockers.clear();
}


export function checkShutdownReady() {
    if (!shutdownRequested) {
        return false;
    }

    if (blockers.size !== 0) {
        console.log(
            "Shutdown waiting on:",
            [...blockers].join(", ")
        );

        return false;
    }

    try {
        const temporaryFile = `${READY_FILE}.tmp`;

        fs.writeFileSync(
            temporaryFile,
            JSON.stringify(
                {
                    request_id: shutdownRequestId,
                    ready: true,
                    timestamp: new Date().toISOString()
                },
                null,
                2
            )
        );

        fs.renameSync(
            temporaryFile,
            READY_FILE
        );

        console.log(
            `BargazBot is ready for shutdown: ${shutdownRequestId}`
        );

        return true;

    } catch (error) {
        console.error(
            "Unable to write shutdown readiness:",
            error
        );

        return false;
    }
}
