// Cut the person out of a photograph, leaving a transparent background.
//
// Uses Vision, the macOS framework behind "Copy Subject" in Photos, so it
// needs a Mac (macOS 14 or later) and nothing else — no download, no service.
// The result is a large PNG; pass it through scripts/optimize_images.py before
// the app uses it.
//
//   osascript -l JavaScript scripts/recortar_sujeito.js <photo> <cut-out.png>
ObjC.import('Foundation');
ObjC.import('Vision');
ObjC.import('CoreImage');
ObjC.import('AppKit');

function run(argv) {
  const [input, output] = argv;
  if (!input || !output) return 'Uso: osascript -l JavaScript scripts/recortar_sujeito.js <foto> <recorte.png>';
  const handler = $.VNImageRequestHandler.alloc.initWithURLOptions($.NSURL.fileURLWithPath(input), $.NSDictionary.dictionary);
  const request = $.VNGenerateForegroundInstanceMaskRequest.alloc.init;
  const error = Ref();
  if (!handler.performRequestsError($.NSArray.arrayWithObject(request), error)) return 'Não foi possível analisar a imagem.';
  if (!request.results || request.results.count === 0) return 'Não foi encontrada nenhuma pessoa na imagem.';
  const observation = request.results.objectAtIndex(0);
  const buffer = observation.generateMaskedImageOfInstancesFromRequestHandlerCroppedToInstancesExtentError(observation.allInstances, handler, false, error);
  if (!buffer) return 'Não foi possível recortar.';
  const rep = $.NSBitmapImageRep.alloc.initWithCIImage($.CIImage.imageWithCVPixelBuffer(buffer));
  rep.representationUsingTypeProperties($.NSBitmapImageFileTypePNG, $.NSDictionary.dictionary).writeToFileAtomically(output, true);
  return `Recorte guardado em ${output}`;
}
