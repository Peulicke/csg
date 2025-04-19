import { vec3 } from "@peulicke/geometry";

export type Field<T> = (pos: vec3.Vec3) => T;

export type Transformation<T> = (field: T) => T;

export const translate =
    <T>(v: vec3.Vec3): Transformation<Field<T>> =>
    field =>
    pos =>
        field(vec3.sub(pos, v));

export const rotate =
    <T>(axis: vec3.Vec3, angle: number): Transformation<Field<T>> =>
    field =>
    pos =>
        field(vec3.rotate(pos, axis, -angle));

export const combineTransformations = <T>(transformations: Transformation<Field<T>>[]): Transformation<Field<T>> =>
    transformations.reduce((s, v) => pos => v(s(pos)));
