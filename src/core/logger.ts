export class Logger {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static debug(...args: any) {
        if (typeof console.debug === 'function') {
            // eslint-disable-next-line no-console
            console.debug(...args);
        } else {
            Logger.info(...args);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static info(...args: any) {
        if (typeof console.info === 'function') {
            // eslint-disable-next-line no-console
            console.info(...args);
        }
    }

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    static error(...args: any) {
        if (typeof console.error === 'function') {
            // eslint-disable-next-line no-console
            console.error(...args);
        } else {
            Logger.info(...args);
        }
    }
}
