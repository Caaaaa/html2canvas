import {ElementPaint, parseStackingContexts, StackingContext} from '../render/stacking-context';
import {asString, Color, isTransparent} from '../css/types/color';
import {Logger} from './logger';
import {ElementContainer} from '../dom/element-container';
import {BORDER_STYLE} from '../css/property-descriptors/border-style';
import {CSSParsedDeclaration} from '../css/index';
import {TextContainer} from '../dom/text-container';
import {Path} from '../render/path';
import {BACKGROUND_CLIP} from '../css/property-descriptors/background-clip';
import {BoundCurves, calculateBorderBoxPath, calculatePaddingBoxPath} from '../render/bound-curves';
import {isBezierCurve} from '../render/bezier-curve';
import {Vector} from '../render/vector';
import {CSSImageType, CSSURLImage} from '../css/types/image';
import {parsePathForBorder} from '../render/border';
import {Cache} from './cache-storage';
import {
    calculateBackgroundRepeatPath,
    calculateBackgroundSize,
    calculateBackgroungPositioningArea,
    getBackgroundValueForIndex
} from '../render/background';
import {getAbsoluteValueForTuple} from '../css/types/length-percentage';
import {isDimensionToken} from '../css/syntax/parser';
import {TextBounds} from '../css/layout/text';
import {fromCodePoint, toCodePoints} from 'css-line-break';
import {ImageElementContainer} from '../dom/replaced-elements/image-element-container';
import {contentBox} from '../render/box-sizing';
import {CanvasElementContainer} from '../dom/replaced-elements/canvas-element-container';
import {SVGElementContainer} from '../dom/replaced-elements/svg-element-container';
import {ReplacedElementContainer} from '../dom/replaced-elements/index';
import {EffectTarget, IElementEffect, isClipEffect, isTransformEffect} from '../render/effects';
import {contains} from './bitwise';

export interface RenderOptions {
    scale: number;
    canvas?: HTMLCanvasElement;
    backgroundColor: Color | null;
    x: number;
    y: number;
    width: number;
    height: number;
    cache: Cache;
}

export class CanvasRenderer {
    canvas: HTMLCanvasElement;
    ctx: CanvasRenderingContext2D;
    options: RenderOptions;
    private readonly _activeEffects: IElementEffect[] = [];

    constructor(options: RenderOptions) {
        this.canvas = options.canvas ? options.canvas : document.createElement('canvas');
        this.ctx = this.canvas.getContext('2d') as CanvasRenderingContext2D;
        this.options = options;
        this.canvas.width = Math.floor(options.width * options.scale);
        this.canvas.height = Math.floor(options.height * options.scale);
        this.canvas.style.width = `${options.width}px`;
        this.canvas.style.height = `${options.height}px`;

        this.ctx.scale(this.options.scale, this.options.scale);
        this.ctx.translate(-options.x, -options.y);
        this.ctx.textBaseline = 'bottom';
        this._activeEffects = [];
        Logger.debug(
            `Canvas renderer initialized (${options.width}x${options.height} at ${options.x},${options.y}) with scale ${
                options.scale
            }`
        );
    }

    applyEffects(effects: IElementEffect[], target: EffectTarget) {
        while (this._activeEffects.length) {
            this.popEffect();
        }

        effects.filter(effect => contains(effect.target, target)).forEach(effect => this.applyEffect(effect));
    }

    applyEffect(effect: IElementEffect) {
        this.ctx.save();
        if (isTransformEffect(effect)) {
            this.ctx.translate(effect.offsetX, effect.offsetY);
            this.ctx.transform(
                effect.matrix[0],
                effect.matrix[1],
                effect.matrix[2],
                effect.matrix[3],
                effect.matrix[4],
                effect.matrix[5]
            );
            this.ctx.translate(-effect.offsetX, -effect.offsetY);
        }

        if (isClipEffect(effect)) {
            this.path(effect.path);
            this.ctx.clip();
        }

        this._activeEffects.push(effect);
    }

    popEffect() {
        this._activeEffects.pop();
        this.ctx.restore();
    }

    async renderStack(stack: StackingContext) {
        const styles = stack.element.container.styles;
        if (styles.isVisible()) {
            this.ctx.globalAlpha = styles.opacity;
            await this.renderStackContent(stack);
        }
    }

    async renderNode(paint: ElementPaint) {
        if (paint.container.styles.isVisible()) {
            await this.renderNodeBackgroundAndBorders(paint);
            await this.renderNodeContent(paint);
        }
    }

    renderTextWithLetterSpacing(text: TextBounds, letterSpacing: number) {
        if (letterSpacing === 0) {
            this.ctx.fillText(text.text, text.bounds.left, text.bounds.top + text.bounds.height);
        } else {
            const letters = toCodePoints(text.text).map(i => fromCodePoint(i));
            letters.reduce((left, letter) => {
                this.ctx.fillText(letter, left, text.bounds.top + text.bounds.height);

                return left + this.ctx.measureText(letter).width;
            }, text.bounds.left);
        }
    }

    async renderTextNode(text: TextContainer, styles: CSSParsedDeclaration) {
        /*this.ctx.font = [
            font.fontStyle,
            font.fontVariant,
            font.fontWeight,
            font.fontSize,
            font.fontFamily
        ].join(' ');



*/
        const fontVariant = styles.fontVariant
            .filter(variant => variant === 'normal' || variant === 'small-caps')
            .join('');
        const fontSize = isDimensionToken(styles.fontSize)
            ? `${styles.fontSize.number}${styles.fontSize.unit}`
            : styles.fontSize.number;

        this.ctx.font = [styles.fontStyle, fontVariant, styles.fontWeight, fontSize, styles.fontFamily.join(', ')].join(
            ' '
        );

        text.textBounds.forEach(text => {
            this.ctx.fillStyle = asString(styles.color);
            this.renderTextWithLetterSpacing(text, styles.letterSpacing);

            /*if (textShadows && text.text.trim().length) {
                textShadows.slice(0).reverse().forEach(textShadow => {
                    this.ctx.shadowColor = textShadow.color.toString();
                    this.ctx.shadowOffsetX = textShadow.offsetX * this.options.scale;
                    this.ctx.shadowOffsetY = textShadow.offsetY * this.options.scale;
                    this.ctx.shadowBlur = textShadow.blur;

                    this.ctx.fillText(
                        text.text,
                        text.bounds.left,
                        text.bounds.top + text.bounds.height
                    );
                });

                this.ctx.shadowColor = '';
                this.ctx.shadowOffsetX = 0;
                this.ctx.shadowOffsetY = 0;
                this.ctx.shadowBlur = 0;
            } else {*/

            //  }
            /*
            if (textDecoration !== null) {
                const textDecorationColor = textDecoration.textDecorationColor || color;
                textDecoration.textDecorationLine.forEach(textDecorationLine => {
                    switch (textDecorationLine) {
                        case TEXT_DECORATION_LINE.UNDERLINE:
                            // Draws a line at the baseline of the font
                            // TODO As some browsers display the line as more than 1px if the font-size is big,
                            // need to take that into account both in position and size
                            const {baseline} = this.options.fontMetrics.getMetrics(font);
                            this.rectangle(
                                text.bounds.left,
                                Math.round(text.bounds.top + baseline),
                                text.bounds.width,
                                1,
                                textDecorationColor
                            );
                            break;
                        case TEXT_DECORATION_LINE.OVERLINE:
                            this.rectangle(
                                text.bounds.left,
                                Math.round(text.bounds.top),
                                text.bounds.width,
                                1,
                                textDecorationColor
                            );
                            break;
                        case TEXT_DECORATION_LINE.LINE_THROUGH:
                            // TODO try and find exact position for line-through
                            const {middle} = this.options.fontMetrics.getMetrics(font);
                            this.rectangle(
                                text.bounds.left,
                                Math.ceil(text.bounds.top + middle),
                                text.bounds.width,
                                1,
                                textDecorationColor
                            );
                            break;
                    }
                });
            }*/
        });
    }

    renderReplacedElement(
        container: ReplacedElementContainer,
        curves: BoundCurves,
        image: HTMLImageElement | HTMLCanvasElement
    ) {
        if (image && container.intrinsicWidth > 0 && container.intrinsicHeight > 0) {
            const box = contentBox(container);
            const path = calculatePaddingBoxPath(curves);
            this.path(path);
            this.ctx.save();
            this.ctx.clip();
            this.ctx.drawImage(
                image,
                0,
                0,
                container.intrinsicWidth,
                container.intrinsicHeight,
                box.left,
                box.top,
                box.width,
                box.height
            );
            this.ctx.restore();
        }
    }

    async renderNodeContent(paint: ElementPaint) {
        this.applyEffects(paint.effects, EffectTarget.CONTENT);
        const container = paint.container;
        const curves = paint.curves;
        const styles = container.styles;
        for (const child of container.textNodes) {
            await this.renderTextNode(child, styles);
        }

        if (container instanceof ImageElementContainer) {
            try {
                const image = await this.options.cache.match(container.src);
                this.renderReplacedElement(container, curves, image);
            } catch (e) {
                Logger.error(`Error loading image ${container.src}`);
            }
        }

        if (container instanceof CanvasElementContainer) {
            this.renderReplacedElement(container, curves, container.canvas);
        }

        if (container instanceof SVGElementContainer) {
            try {
                const image = await this.options.cache.match(container.svg);
                this.renderReplacedElement(container, curves, image);
            } catch (e) {
                Logger.error(`Error loading svg ${container.svg.substring(0, 255)}`);
            }
        }

        /*
        const callback = () => {


            if (container.image) {
                const image = this.options.imageStore.get(container.image);
                if (image) {
                    const contentBox = calculateContentBox(
                        container.bounds,
                        container.style.padding,
                        container.style.border
                    );
                    const width =
                        typeof image.width === 'number' && image.width > 0
                            ? image.width
                            : contentBox.width;
                    const height =
                        typeof image.height === 'number' && image.height > 0
                            ? image.height
                            : contentBox.height;
                    if (width > 0 && height > 0) {
                        this.target.clip([calculatePaddingBoxPath(container.curvedBounds)], () => {
                            this.target.drawImage(
                                image,
                                new Bounds(0, 0, width, height),
                                contentBox
                            );
                        });
                    }
                }
            }
        };
        const paths = container.getClipPaths();
        if (paths.length) {
            this.target.clip(paths, callback);
        } else {
            callback();
        }*/
    }

    async renderStackContent(stack: StackingContext) {
        // https://www.w3.org/TR/css-position-3/#painting-order
        // 1. the background and borders of the element forming the stacking context.
        await this.renderNodeBackgroundAndBorders(stack.element);
        // 2. the child stacking contexts with negative stack levels (most negative first).
        for (const child of stack.negativeZIndex) {
            await this.renderStack(child);
        }
        // 3. For all its in-flow, non-positioned, block-level descendants in tree order:
        await this.renderNodeContent(stack.element);

        for (const child of stack.nonInlineLevel) {
            await this.renderNode(child);
        }
        // 4. All non-positioned floating descendants, in tree order. For each one of these,
        // treat the element as if it created a new stacking context, but any positioned descendants and descendants
        // which actually create a new stacking context should be considered part of the parent stacking context,
        // not this new one.
        for (const child of stack.nonPositionedFloats) {
            await this.renderStack(child);
        }
        // 5. the in-flow, inline-level, non-positioned descendants, including inline tables and inline blocks.
        for (const child of stack.nonPositionedInlineLevel) {
            await this.renderStack(child);
        }
        for (const child of stack.inlineLevel) {
            await this.renderNode(child);
        }
        // 6. All positioned, opacity or transform descendants, in tree order that fall into the following categories:
        //  All positioned descendants with 'z-index: auto' or 'z-index: 0', in tree order.
        //  For those with 'z-index: auto', treat the element as if it created a new stacking context,
        //  but any positioned descendants and descendants which actually create a new stacking context should be
        //  considered part of the parent stacking context, not this new one. For those with 'z-index: 0',
        //  treat the stacking context generated atomically.
        //
        //  All opacity descendants with opacity less than 1
        //
        //  All transform descendants with transform other than none
        for (const child of stack.zeroOrAutoZIndexOrTransformedOrOpacity) {
            await this.renderStack(child);
        }
        // 7. Stacking contexts formed by positioned descendants with z-indices greater than or equal to 1 in z-index
        // order (smallest first) then tree order.
        for (const child of stack.positiveZIndex) {
            await this.renderStack(child);
        }
    }

    path(paths: Path[]) {
        this.ctx.beginPath();

        paths.forEach((point, index) => {
            const start: Vector = isBezierCurve(point) ? point.start : point;
            if (index === 0) {
                this.ctx.moveTo(start.x, start.y);
            } else {
                this.ctx.lineTo(start.x, start.y);
            }

            if (isBezierCurve(point)) {
                this.ctx.bezierCurveTo(
                    point.startControl.x,
                    point.startControl.y,
                    point.endControl.x,
                    point.endControl.y,
                    point.end.x,
                    point.end.y
                );
            }
        });

        this.ctx.closePath();
    }

    renderRepeat(
        path: Path[],
        image: HTMLImageElement,
        imageWidth: number,
        imageHeight: number,
        offsetX: number,
        offsetY: number
    ) {
        this.path(path);
        this.ctx.fillStyle = this.ctx.createPattern(
            this.resizeImage(image, imageWidth, imageHeight),
            'repeat'
        ) as CanvasPattern;
        this.ctx.translate(offsetX, offsetY);
        this.ctx.fill();
        this.ctx.translate(-offsetX, -offsetY);
    }

    resizeImage(image: HTMLImageElement, width: number, height: number): HTMLCanvasElement | HTMLImageElement {
        if (image.width === width && image.height === height) {
            return image;
        }

        const canvas = (this.canvas.ownerDocument as Document).createElement('canvas');
        canvas.width = width;
        canvas.height = height;
        const ctx = canvas.getContext('2d') as CanvasRenderingContext2D;
        ctx.drawImage(image, 0, 0, image.width, image.height, 0, 0, width, height);
        return canvas;
    }

    async renderBackgroundImage(container: ElementContainer) {
        let index = container.styles.backgroundImage.length - 1;
        for (const backgroundImage of container.styles.backgroundImage.slice(0).reverse()) {
            if (backgroundImage.type === CSSImageType.URL) {
                let image;
                const url = (backgroundImage as CSSURLImage).url;
                try {
                    image = await this.options.cache.match(url);
                } catch (e) {
                    Logger.error(`Error loading background-image ${url}`);
                }

                if (!image) {
                    return;
                }

                const backgroundPositioningArea = calculateBackgroungPositioningArea(
                    getBackgroundValueForIndex(container.styles.backgroundOrigin, index),
                    container
                );
                const backgroundImageSize = calculateBackgroundSize(
                    getBackgroundValueForIndex(container.styles.backgroundSize, index),
                    image,
                    backgroundPositioningArea
                );
                const [sizeWidth, sizeHeight] = backgroundImageSize;

                const position = getAbsoluteValueForTuple(
                    getBackgroundValueForIndex(container.styles.backgroundPosition, index),
                    backgroundPositioningArea.width - sizeWidth,
                    backgroundPositioningArea.height - sizeHeight
                );

                const path = calculateBackgroundRepeatPath(
                    getBackgroundValueForIndex(container.styles.backgroundRepeat, index),
                    position,
                    backgroundImageSize,
                    backgroundPositioningArea,
                    container.bounds
                );

                const offsetX = Math.round(backgroundPositioningArea.left + position[0]);
                const offsetY = Math.round(backgroundPositioningArea.top + position[1]);
                this.renderRepeat(path, image, sizeWidth, sizeHeight, offsetX, offsetY);
            }
            index--;
        }
    }

    async renderBorder(color: Color, side: number, curvePoints: BoundCurves) {
        this.path(parsePathForBorder(curvePoints, side));
        this.ctx.fillStyle = asString(color);
        this.ctx.fill();
    }

    async renderNodeBackgroundAndBorders(paint: ElementPaint) {
        this.applyEffects(paint.effects, EffectTarget.BACKGROUND_BORDERS);
        const styles = paint.container.styles;
        const hasBackground = !isTransparent(styles.backgroundColor) || styles.backgroundImage.length;

        const borders = [
            {style: styles.borderTopStyle, color: styles.borderTopColor},
            {style: styles.borderRightStyle, color: styles.borderRightColor},
            {style: styles.borderBottomStyle, color: styles.borderBottomColor},
            {style: styles.borderLeftStyle, color: styles.borderLeftColor}
        ];

        const backgroundPaintingArea = calculateBackgroungPaintingArea(
            getBackgroundValueForIndex(styles.backgroundClip, 0),
            paint.curves
        );
        if (hasBackground) {
            this.ctx.save();
            this.path(backgroundPaintingArea);

            this.ctx.clip();

            if (!isTransparent(styles.backgroundColor)) {
                this.ctx.fillStyle = asString(styles.backgroundColor);
                this.ctx.fill();
            }

            await this.renderBackgroundImage(paint.container);

            this.ctx.restore();
        }

        let side = 0;
        for (const border of borders) {
            if (border.style !== BORDER_STYLE.NONE && !isTransparent(border.color)) {
                await this.renderBorder(border.color, side++, paint.curves);
            }
        }
    }

    async render(element: ElementContainer): Promise<HTMLCanvasElement> {
        if (this.options.backgroundColor) {
            this.ctx.fillStyle = asString(this.options.backgroundColor);
            this.ctx.fillRect(this.options.x, this.options.y, this.options.width, this.options.height);
        }

        const stack = parseStackingContexts(element);

        await this.renderStack(stack);
        this.applyEffects([], EffectTarget.BACKGROUND_BORDERS);
        return this.canvas;
    }
}

const calculateBackgroungPaintingArea = (clip: BACKGROUND_CLIP, curves: BoundCurves): Path[] => {
    switch (clip) {
        case BACKGROUND_CLIP.BORDER_BOX:
            return calculateBorderBoxPath(curves);
        case BACKGROUND_CLIP.PADDING_BOX:
        default:
            return calculatePaddingBoxPath(curves);
    }
};
