export enum LogLevel {
  NONE = 0,
  ERROR = 1,
  WARN = 2,
  INFO = 3,
  DEBUG = 4,
}

export class Logger {
  private static level: LogLevel = LogLevel.ERROR;

  static setLevel(level: LogLevel) {
    this.level = level;
  }

  static debug(message: string, ...args: any[]) {
    if (this.level >= LogLevel.DEBUG) {
      console.debug(`[MessagingClient] DEBUG: ${message}`, ...args);
    }
  }

  static info(message: string, ...args: any[]) {
    if (this.level >= LogLevel.INFO) {
      console.info(`[MessagingClient] INFO: ${message}`, ...args);
    }
  }

  static warn(message: string, ...args: any[]) {
    if (this.level >= LogLevel.WARN) {
      console.warn(`[MessagingClient] WARN: ${message}`, ...args);
    }
  }

  static error(message: string, ...args: any[]) {
    if (this.level >= LogLevel.ERROR) {
      console.error(`[MessagingClient] ERROR: ${message}`, ...args);
    }
  }
}
