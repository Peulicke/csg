import { randomInt } from "@peulicke/algorithms/random";
import { grid, vec2, vec3 } from "@peulicke/geometry";
import { getGradient, type Sdf, trace } from "./sdf";
import type { Model } from "./model";
import { getTransparent, type Pixel, type Pixels } from "@peulicke/image/pixels";
import { get } from "@peulicke/algorithms/basic";

export type LightSource = {
    dir: vec3.Vec3 | undefined;
    color: vec3.Vec3;
};

const getPixel = (model: Model, startPos: vec3.Vec3, dir: vec3.Vec3, lightSources: LightSource[]): Pixel => {
    const pos = trace(model.sdf, startPos, dir);
    if (pos === undefined) return getTransparent();
    const normal = getGradient(model.sdf, pos);
    let color: vec3.Vec3 = [0, 0, 0];
    lightSources.forEach(lightSource => {
        if (lightSource.dir !== undefined) {
            const p = trace(model.sdf, vec3.add(pos, vec3.scale(lightSource.dir, 1e-3)), lightSource.dir);
            if (p !== undefined) return;
        }
        const reflection = lightSource.dir === undefined ? 1 : vec3.dot(normal, lightSource.dir);
        color = vec3.add(color, vec3.scale(vec3.multiply(model.colorField(pos), lightSource.color), reflection));
    });
    return { color, alpha: 1 };
};

const getShadowPixel = (
    model: Model,
    groundSdf: Sdf,
    startPos: vec3.Vec3,
    dir: vec3.Vec3,
    lightSources: LightSource[]
): Pixel => {
    const groundPos = trace(groundSdf, startPos, dir);
    if (groundPos === undefined) return { color: [0, 0, 0], alpha: 0 };
    let alpha = 0;
    lightSources.forEach(lightSource => {
        if (lightSource.dir === undefined) return;
        const p = trace(model.sdf, vec3.add(groundPos, vec3.scale(lightSource.dir, 1e-3)), lightSource.dir);
        if (p === undefined) return;
        alpha += 1 / lightSources.length;
    });
    return { color: [0, 0, 0], alpha };
};

const pixelCoordsToScreenCoords = (resolution: vec2.Vec2) => (coords: vec2.Vec2) =>
    vec2.scale(vec2.sub(vec2.add(coords, [0.5, 0.5]), vec2.scale(resolution, 0.5)), 1 / resolution[1]);

type MultiSamplePattern = "1" | "8";

const getMultisamplePattern1 = (): vec2.Vec2[] => [[0, 0]];

const getMultisamplePattern8 = (): vec2.Vec2[] => {
    const posArray: vec2.Vec2[] = [
        [1, -3],
        [-1, 3],
        [5, 1],
        [-3, -5],
        [-5, 5],
        [-7, -1],
        [3, 7],
        [7, -7]
    ];
    return posArray.map(pos => vec2.scale(pos, 1 / 16));
};

const getMultisamplePattern = (pattern: MultiSamplePattern): vec2.Vec2[] => {
    if (pattern === "1") return getMultisamplePattern1();
    if (pattern === "8") return getMultisamplePattern8();
    throw Error(`Invalid pattern ${pattern}`);
};

const avgPixel = (pixels: Pixel[]): Pixel => {
    let color: vec3.Vec3 = [0, 0, 0];
    let alpha = 0;
    pixels.forEach(pixel => {
        alpha += pixel.alpha;
        color = vec3.add(color, vec3.scale(pixel.color, pixel.alpha));
    });
    color = vec3.scale(color, 1 / alpha);
    alpha /= pixels.length;
    return { color, alpha };
};

export type RenderPixel = (model: Model, screenCoords: vec2.Vec2, lightSourcesNormalized: LightSource[]) => Pixel;

const perspectiveRenderPixel: RenderPixel = (model, screenCoords, lightSourcesNormalized) => {
    const dir = vec3.normalize([screenCoords[0], -screenCoords[1], -1]);
    return getPixel(model, [0, 0, 0], dir, lightSourcesNormalized);
};

const orthographicRenderPixel: RenderPixel = (sdf, screenCoords, lightSourcesNormalized) =>
    getPixel(sdf, [screenCoords[0], -screenCoords[1], 0], [0, 0, -1], lightSourcesNormalized);

const orthographicRenderShadowPixel =
    (groundSdf: Sdf): RenderPixel =>
    (sdf, screenCoords, lightSourcesNormalized) =>
        getShadowPixel(sdf, groundSdf, [screenCoords[0], -screenCoords[1], 0], [0, 0, -1], lightSourcesNormalized);

const orthographicRenderWithShadowPixel =
    (groundSdf: Sdf): RenderPixel =>
    (sdf, screenCoords, lightSourcesNormalized) => {
        const pixel = getPixel(sdf, [screenCoords[0], -screenCoords[1], 0], [0, 0, -1], lightSourcesNormalized);
        const shadowPixel = getShadowPixel(
            sdf,
            groundSdf,
            [screenCoords[0], -screenCoords[1], 0],
            [0, 0, -1],
            lightSourcesNormalized
        );
        return {
            color: vec3.add(pixel.color, vec3.scale(shadowPixel.color, 1 - pixel.alpha)),
            alpha: pixel.alpha + shadowPixel.alpha * (1 - pixel.alpha)
        };
    };

export type RenderImage = (
    model: Model,
    lightSources: LightSource[],
    resolution: vec2.Vec2,
    pattern: MultiSamplePattern
) => Pixels;

export const renderImage =
    (renderPixel: RenderPixel): RenderImage =>
    (sdf, lightSources, resolution, pattern) => {
        const lightSourcesNormalized = lightSources.map(ls => ({
            ...ls,
            dir: ls.dir === undefined ? undefined : vec3.normalize(ls.dir)
        }));
        const getCoords = pixelCoordsToScreenCoords(resolution);
        const offsets = getMultisamplePattern(pattern);
        const posToPixel = (pos: vec2.Vec2) =>
            avgPixel(offsets.map(offset => renderPixel(sdf, getCoords(vec2.add(pos, offset)), lightSourcesNormalized)));
        return grid.create(resolution, posToPixel);
    };

export const renderPerspective = renderImage(perspectiveRenderPixel);

export const renderOrthographic = renderImage(orthographicRenderPixel);

export const renderOrthographicShadow = (groundSdf: Sdf) => renderImage(orthographicRenderShadowPixel(groundSdf));

const updateDists = (dists: { pixel: Pixel; dist: number }[][], pixel: Pixel, pos: vec2.Vec2): void => {
    const queue = [{ pixel, pos, dist: 0 }];
    while (queue.length > 0) {
        const next = queue.shift();
        if (next === undefined) return;
        const cell = grid.getCell(dists, next.pos, () => undefined);
        if (cell === undefined) continue;
        if (cell.dist <= next.dist) continue;
        grid.setCell(dists, next.pos, { pixel: next.pixel, dist: next.dist });
        vec2.gridNeighbors(next.pos).forEach(({ p, n }) => {
            const c = grid.getCell(dists, p, () => undefined);
            if (c === undefined) return;
            const d = next.dist + vec2.length(n);
            if (cell.dist <= d) return;
            queue.push({ pixel: next.pixel, pos: p, dist: d });
        });
    }
};

export type RenderPartialImage = (
    model: Model,
    lightSources: LightSource[],
    resolution: vec2.Vec2,
    random: () => number,
    pattern: MultiSamplePattern
) => { pixels: Pixels; step: () => boolean };

const popMax = <T>(
    array: T[],
    getScore: (obj: T) => number,
    sampleCount: number,
    random: () => number
): T | undefined => {
    if (array.length === 0) return undefined;
    let maxScore = -Infinity;
    let maxIndex = -1;
    const indices = [...Array(sampleCount)].map(() => randomInt(random)(0, array.length - 1));
    indices.forEach(i => {
        const obj = get(array, i);
        const score = getScore(obj);
        if (score <= maxScore) return;
        maxScore = score;
        maxIndex = i;
    });
    return array.splice(maxIndex, 1)[0];
};

export const renderPartialImage =
    (renderPixel: RenderPixel): RenderPartialImage =>
    (model, lightSources, resolution, random, pattern) => {
        const lightSourcesNormalized = lightSources.map(ls => ({
            ...ls,
            dir: ls.dir === undefined ? undefined : vec3.normalize(ls.dir)
        }));
        const getCoords = pixelCoordsToScreenCoords(resolution);

        const offsets = getMultisamplePattern(pattern);
        const posToPixel = (pos: vec2.Vec2) =>
            avgPixel(
                offsets.map(offset => renderPixel(model, getCoords(vec2.add(pos, offset)), lightSourcesNormalized))
            );
        const pixels = grid.create(resolution, getTransparent);
        const posArray = pixels.flatMap((row, i) => row.map((_, j): vec2.Vec2 => [i, j]));

        const distToNearestRenderedPixel = grid.create(resolution, () => ({ pixel: getTransparent(), dist: Infinity }));

        const step = () => {
            const getColorDiff = (pos: vec2.Vec2) => {
                const edges = vec2.gridEdges(pos);
                const colors = edges
                    .map(({ p }) => grid.getCell(distToNearestRenderedPixel, p, () => undefined)?.pixel?.color)
                    .filter((pixel): pixel is vec3.Vec3 => pixel !== undefined);
                const colorSum = colors.reduce((s, v) => vec3.add(s, v));
                const colorAvg = vec3.scale(colorSum, 1 / colors.length);
                const diff = vec3.sub(
                    colorAvg,
                    grid.getCell(distToNearestRenderedPixel, pos, () => undefined)?.pixel.color ??
                        getTransparent().color
                );
                return vec3.length(diff);
            };

            const pos = popMax(
                posArray,
                obj => {
                    const distScore = grid.getCell(distToNearestRenderedPixel, obj, () => undefined)?.dist ?? Infinity;
                    const colorScore = getColorDiff(obj);
                    return distScore + 32 * colorScore;
                },
                32,
                random
            );
            if (pos === undefined) return false;

            updateDists(distToNearestRenderedPixel, posToPixel(pos), pos);
            grid.map(distToNearestRenderedPixel, ({ pixel }, p) => {
                grid.setCell(pixels, p, pixel);
            });
            return true;
        };

        return { pixels, step };
    };

export const renderPartialPerspective = renderPartialImage(perspectiveRenderPixel);

export const renderPartialOrthographic = renderPartialImage(orthographicRenderPixel);

export const renderPartialOrthographicShadow = (groundSdf: Sdf) =>
    renderPartialImage(orthographicRenderShadowPixel(groundSdf));

export const renderPartialOrthographicWithShadow = (groundSdf: Sdf) =>
    renderPartialImage(orthographicRenderWithShadowPixel(groundSdf));
