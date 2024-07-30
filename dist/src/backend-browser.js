export function registerPaintFont(match, buffer, filename) {
    const descriptor = match.toCssDescriptor();
    const face = new FontFace(descriptor.family, buffer, descriptor);
    document.fonts.add(face);
}
