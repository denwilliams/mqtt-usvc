export interface Logger {
  info(message?: any, ...optionalParams: any[]): void;
  warn(message?: any, ...optionalParams: any[]): void;
  error(message?: any, ...optionalParams: any[]): void;
}

export function getLogger(options?: { logger?: Logger }): Logger {
  if (options?.logger) {
    return options.logger;
  }

  return console;
}
