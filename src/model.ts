import { get, getMinObj, sum } from "@peulicke/algorithms/basic";
import { vec3 } from "@peulicke/geometry";
import * as field from "./field";
import * as sdf from "./sdf";
import * as colorField from "./color-field";

export type Model = {
    sdf: sdf.Sdf;
    colorField: colorField.ColorField;
};

export type Transformation = field.Transformation<Model>;

const mergeColorFields =
    (modelArray: Model[], k: number): colorField.ColorField =>
    pos => {
        const dists = modelArray.map(model => Math.abs(model.sdf(pos)));
        if (k === 0) {
            const index =
                getMinObj(
                    dists.map((d, i) => ({ d, i })),
                    ({ d }) => d
                )?.i ?? 0;
            return get(modelArray, index).colorField(pos);
        }
        const weights = dists.map(dist => Math.pow(2, -dist / k));
        const colorArray = modelArray.map((model, i) => vec3.scale(model.colorField(pos), get(weights, i)));
        return vec3.scale(
            colorArray.reduce((s, v) => vec3.add(s, v)),
            1 / sum(weights)
        );
    };

export const union = (modelArray: Model[], blend = 0, colorBlend = 0): Model => ({
    sdf: sdf.union(
        modelArray.map(model => model.sdf),
        blend
    ),
    colorField: mergeColorFields(modelArray, colorBlend)
});

export const intersection = (modelArray: Model[], blend = 0, colorBlend = 0): Model => ({
    sdf: sdf.intersection(
        modelArray.map(model => model.sdf),
        blend
    ),
    colorField: mergeColorFields(modelArray, colorBlend)
});

export const subtraction = (a: Model, b: Model, blend = 0, colorBlend = 0): Model => ({
    sdf: sdf.subtraction(a.sdf, b.sdf, blend),
    colorField: mergeColorFields([a, b], colorBlend)
});

export const translate =
    (v: vec3.Vec3): Transformation =>
    model => ({ sdf: sdf.translate(v)(model.sdf), colorField: colorField.translate(v)(model.colorField) });

export const scale =
    (v: number): Transformation =>
    model => ({ sdf: sdf.scale(v)(model.sdf), colorField: colorField.scale(v)(model.colorField) });

export const rotate =
    (axis: vec3.Vec3, angle: number): Transformation =>
    model => ({
        sdf: sdf.rotate(axis, angle)(model.sdf),
        colorField: colorField.rotate(axis, angle)(model.colorField)
    });

export const combineTransformations = (transformations: Transformation[]): Transformation =>
    transformations.reduce((s, v) => pos => v(s(pos)));

export const createSphere =
    (color: vec3.Vec3) =>
    (pos: vec3.Vec3, r: number): Model => ({
        sdf: sdf.createSphere(pos, r),
        colorField: () => color
    });

export const createBox =
    (color: vec3.Vec3) =>
    (r: vec3.Vec3, roundness = 0): Model => ({
        sdf: sdf.createBox(r, roundness),
        colorField: () => color
    });

export const createCylinder =
    (color: vec3.Vec3) =>
    (r: number, h: number, roundness = 0): Model => ({
        sdf: sdf.createCylinder(r, h, roundness),
        colorField: () => color
    });

export const createBoxFrame =
    (color: vec3.Vec3) =>
    (r: vec3.Vec3, thickness: number, roundness = 0): Model => ({
        sdf: sdf.createBoxFrame(r, thickness, roundness),
        colorField: () => color
    });

export const createCapsule =
    (color: vec3.Vec3) =>
    (a: vec3.Vec3, b: vec3.Vec3, r: number): Model => ({ sdf: sdf.createCapsule(a, b, r), colorField: () => color });

export const createHalfSpace =
    (color: vec3.Vec3) =>
    (pos: vec3.Vec3, dir: vec3.Vec3): Model => ({ sdf: sdf.createHalfSpace(pos, dir), colorField: () => color });
