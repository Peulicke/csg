import { vec2, vec3 } from "@peulicke/geometry";
import * as field from "./field";

export type Sdf = field.Field<number>;

export type Transformation = (sdf: Sdf) => Sdf;

const smoothMin = (a: number, b: number, k: number) => {
    const x = b - a;
    return 0.5 * (a + b - Math.sqrt(x * x + (2 * k) ** 2));
};

const unionPair =
    (a: Sdf, b: Sdf, k = 0): Sdf =>
    pos =>
        smoothMin(a(pos), b(pos), k);

export const union = (sdfArray: Sdf[], k = 0): Sdf => sdfArray.reduce((s, v) => unionPair(s, v, k));

const intersectionPair =
    (a: Sdf, b: Sdf, k = 0): Sdf =>
    pos =>
        -smoothMin(-a(pos), -b(pos), k);

export const intersection = (sdfArray: Sdf[], k = 0): Sdf => sdfArray.reduce((s, v) => intersectionPair(s, v, k));

export const subtraction =
    (a: Sdf, b: Sdf, k = 0): Sdf =>
    pos =>
        -smoothMin(-a(pos), b(pos), k);

export const translate = field.translate<number>;

export const scale =
    (v: number): Transformation =>
    sdf =>
    pos =>
        sdf(vec3.scale(pos, 1 / v)) * v;

export const rotate = field.rotate<number>;

export const combineTransformations = field.combineTransformations<number>;

const createUnitSphere = (): Sdf => pos => vec3.length(pos) - 1;

export const createSphere = (pos: vec3.Vec3, r: number): Sdf => translate(pos)(scale(r)(createUnitSphere()));

export const createBox =
    (r: vec3.Vec3, roundness = 0): Sdf =>
    p => {
        const rSmall = vec3.sub(r, [roundness, roundness, roundness]);
        const q = vec3.sub(vec3.abs(p), rSmall);
        return vec3.length(vec3.max(q, [0, 0, 0])) + Math.min(Math.max(...q), 0.0) - roundness;
    };

export const createCylinder =
    (r: number, h: number, roundness = 0): Sdf =>
    pos => {
        const d: vec2.Vec2 = [vec2.length([pos[0], pos[2]]) - r + roundness, Math.abs(pos[1]) - h / 2];
        return Math.min(Math.max(d[0], d[1]), 0) + vec2.length([Math.max(d[0], 0), Math.max(d[1], 0)]) - roundness;
    };

export const createBoxFrame =
    (r: vec3.Vec3, thickness: number, roundness = 0): Sdf =>
    pos => {
        const thicknessSmall = thickness - roundness;
        const t: vec3.Vec3 = [thicknessSmall, thicknessSmall, thicknessSmall];
        const rSmall = vec3.sub(r, [roundness, roundness, roundness]);
        const p = vec3.sub(vec3.abs(pos), rSmall);
        const q = vec3.sub(vec3.abs(vec3.add(p, t)), t);
        return (
            Math.min(
                vec3.length(vec3.max([p[0], q[1], q[2]], [0, 0, 0])) + Math.min(Math.max(p[0], q[1], q[2]), 0),
                vec3.length(vec3.max([q[0], p[1], q[2]], [0, 0, 0])) + Math.min(Math.max(q[0], p[1], q[2]), 0),
                vec3.length(vec3.max([q[0], q[1], p[2]], [0, 0, 0])) + Math.min(Math.max(q[0], q[1], p[2]), 0)
            ) - roundness
        );
    };

export const createCapsule =
    (a: vec3.Vec3, b: vec3.Vec3, r: number): Sdf =>
    pos => {
        const pa = vec3.sub(pos, a);
        const ba = vec3.sub(b, a);
        const h = Math.min(Math.max(vec3.dot(pa, ba) / vec3.dot(ba, ba), 0), 1);
        return vec3.length(vec3.sub(pa, vec3.scale(ba, h))) - r;
    };

export const createHalfSpace = (pos: vec3.Vec3, dir: vec3.Vec3): Sdf =>
    translate(pos)(p => vec3.dot(p, vec3.normalize(dir)));

export type Fractal = (model: Sdf, lod: number, smoothness: number) => Sdf;

type Copy = {
    transformation: Transformation;
    detailFrac: number;
};

export type FractalCreator = (copies: Copy[]) => Fractal;

export const createFractal: FractalCreator =
    copies =>
    (model, lod, smoothness = 0) => {
        if (lod < 1) return model;
        return union(
            [model, ...copies.map(c => c.transformation(createFractal(copies)(model, lod * c.detailFrac, smoothness)))],
            smoothness
        );
    };

const getDerivative = (sdf: Sdf, pos: vec3.Vec3, dim: vec3.Vec3) => {
    const epsilon = 1e-10;
    const dimScaled = vec3.scale(dim, epsilon);
    const plus = vec3.add(pos, dimScaled);
    const minus = vec3.sub(pos, dimScaled);
    const diff = sdf(plus) - sdf(minus);
    return diff / (2 * epsilon);
};

export const getGradient = (sdf: Sdf, pos: vec3.Vec3): vec3.Vec3 => {
    const x: vec3.Vec3 = [1, 0, 0];
    const y: vec3.Vec3 = [0, 1, 0];
    const z: vec3.Vec3 = [0, 0, 1];
    const getD = (dim: vec3.Vec3) => getDerivative(sdf, pos, dim);
    return [getD(x), getD(y), getD(z)];
};

export const trace = (sdf: Sdf, startPos: vec3.Vec3, dir: vec3.Vec3): vec3.Vec3 | undefined => {
    const maxIterations = 1000;
    const minMovement = 1e-4;
    const maxMovement = 1e4;
    let pos = startPos;
    for (let i = 0; i < maxIterations; ++i) {
        const dist = sdf(pos);
        const vel = vec3.scale(dir, dist);
        pos = vec3.add(pos, vel);
        if (dist < minMovement) break;
        if (dist > maxMovement) return undefined;
    }
    return pos;
};
