import { vec3 } from "@peulicke/geometry";
import * as field from "./field";

export type ColorField = field.Field<vec3.Vec3>;

export type Transformation = field.Transformation<ColorField>;

export const translate = field.translate<vec3.Vec3>;

export const scale =
    (v: number): Transformation =>
    colorField =>
    pos =>
        colorField(vec3.scale(pos, 1 / v));

export const rotate = field.rotate<vec3.Vec3>;

export const combineTransformations = field.combineTransformations<number>;
