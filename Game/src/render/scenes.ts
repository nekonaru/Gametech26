/**
 * Barrel scenes: seluruh API scene (types, kit, dynamics, props,
 * pembangun adegan, factory) tetap diekspor dari satu berkas ini.
 * Inti fisiknya kini berada di folder scenes/ per bagian.
 */
export * from './scenes/kit.js';
export * from './scenes/dynamics.js';
export * from './scenes/props.js';
export * from './scenes/builders.js';
export * from './scenes/factory.js';
