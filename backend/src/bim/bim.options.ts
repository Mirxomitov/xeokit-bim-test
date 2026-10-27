export interface BimOptions {
  /** Absolute path of the folder with the .xkt files. */
  modelsDir: string;
}

export const BIM_OPTIONS = Symbol('BIM_OPTIONS');
