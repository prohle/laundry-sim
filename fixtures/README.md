# Fixtures

## aphodius-foetens.jpg

A photograph of a dung beetle, *Aphodius foetens* (body length 7.6 mm), on a plain white
background. Used to run `tools/pipeline.ts` on a real image.

- Source: https://commons.wikimedia.org/wiki/File:Aphodius-foetens-01-fws.jpg
- Original file: https://upload.wikimedia.org/wikipedia/commons/a/a0/Aphodius-foetens-01-fws.jpg
- Author: Francisco Welter-Schultes (Wikimedia user Kryp), own work, taken 2021-08-18
- Licence: CC0 1.0 Universal (public domain dedication), as stated on the Commons file page.
  Attribution is not required; it is given anyway.
  https://creativecommons.org/publicdomain/zero/1.0/
- Size: 1590 x 926. SHA-1 `3713fcd78a6c324c93d6e88068d8c0b7bfbfcca4`, which matches the
  hash Commons reports for the file.
- Unmodified.

## aphodius-foetens.mask.png

Derived from the photograph by `tools/pipeline.ts` (512 x 298, black shape on white). Used by
`src/lib/skeleton.photo.test.ts`. It is a derivative of the CC0 image above and is released
under the same CC0 terms.

## bush-dog.png

A bush dog (*Speothos venaticus*) walking, in side view, four legs, tail and head clear, on a plain
white background. The only four-legged fixture; used to run `tools/pipeline.ts` on the class the
product is for.

**Caveat, read before relying on it.** This is not an unedited photograph. Per the Commons file
page, the animal was cut out of a zoo photograph and placed on white, and the page carries the
`{{AI modified}}` tag. Its silhouette is therefore cleaner than a phone photograph of a live
animal would be, and any detail of the limbs may have been altered by the edit. It was chosen over
unmodified candidates because every unmodified CC0 four-legged photograph found was either on
grass (no plain background) or a front-on sitting pose with two visible legs. Replace it with an
unedited studio photograph when one turns up.

- Source: https://commons.wikimedia.org/wiki/File:Bush_dog_on_a_white_background.png
- Original file: https://upload.wikimedia.org/wikipedia/commons/5/52/Bush_dog_on_a_white_background.png
- Author: Vassil (credited as author on the file page; uploaded by Commons user Jester77aa08).
  Derived from Commons file `Chien des buissons Safari de Peaugres 07082017 1 (cropped).jpg`,
  taken 2017-08-07 (file page says 07/08/2017).
- Licence: CC0 1.0 Universal (public domain dedication), as stated on the Commons file page.
  Attribution is not required; it is given anyway.
  https://creativecommons.org/publicdomain/zero/1.0/
- Size: 1564 x 1006. SHA-1 `4fa12b286a6c4d6336ca4e1cb8b90de2a398c2a5`, which matches the
  hash Commons reports for the file.
- Unmodified from the Commons file.

## snapping-turtle.jpg

A common snapping turtle (*Chelydra serpentina*), male, side view, on a white studio background
with a soft floor shadow. Four legs, tail and head are all in frame, though the far legs are
partly hidden by the near ones. Added for the 20 Nov gate (task 3.6).

**Caveat.** The Commons file is titled "white background (2)". It looks like an unretouched
studio photograph, but the file page does not say whether the background was edited and this was
not verified. Do not describe it as unedited.

- Source: https://commons.wikimedia.org/wiki/File:Common_Snapping_Turtle_white_background_(2).jpg
- Original file: https://upload.wikimedia.org/wikipedia/commons/2/28/Common_Snapping_Turtle_white_background_%282%29.jpg
- Author: Sam Stukel, USFWS Mountain Prairie (photographed 2020-02-21 at Gavins Point National
  Fish Hatchery, Yankton, SD); uploaded via Flickr from
  https://www.flickr.com/photos/51986662@N05/49984518617/
- Licence: public domain. Not CC0: the Commons tag is `PD-author-FlickrPDM` (Flickr Public Domain
  Mark, reviewed by FlickreviewR 2, passed 2025-01-25), for a US Fish and Wildlife Service photograph.
- Size: 5055 x 2528. SHA-1 `750487e2decff07a5c4c82a470ce5236a30eeeeb`, which matches the hash
  Commons reports for the file.
- Unmodified from the Commons file.

## tuatara.jpg

A tuatara (*Sphenodon punctatus*) seen from above, head to the left, tail curling up, on a plain
white background. Added for the 20 Nov gate (task 3.6). It is the curled-tail case.

**Caveat, read before relying on it.** This is not an unedited photograph. The Commons file is a
user-made cut-out of `File:Sphenodon punctatus (2).jpg`, placed on white. Its silhouette is
cleaner than a phone photograph would give, and the outline edge may carry cut-out artefacts. The
mask step dropped 21 small components from it. At 740 x 618 it is also much smaller than the others.

- Source: https://commons.wikimedia.org/wiki/File:Sphenodon_punctatus_white_background.jpg
- Original file: https://upload.wikimedia.org/wikipedia/commons/c/cd/Sphenodon_punctatus_white_background.jpg
- Author: TimVickers (Wikimedia user), credited on the file page. The underlying photograph is
  `File:Sphenodon punctatus (2).jpg`; its photographer was not checked.
- Licence: public domain, tag `PD-user|TimVickers` (the uploader released the work into the
  public domain). Not CC0.
  Not independently verified that the underlying photograph is also the uploader's own work.
- Size: 740 x 618. SHA-1 `7e779c461e0dea7611d7a92d33bb053fcb5da72f`, which matches the hash
  Commons reports for the file.
- Unmodified from the Commons file.

## Candidates rejected

- `File:Gray cat with white background.jpg` (CC0): the title is misleading. It is a cat on a
  marble-tiled floor beside kitchen cabinets, with the phone's camera caption strip at the bottom.
- `File:Black Persian.jpg`: cat on crumpled white paper, not a plain background.
- `File:British shorthair cat-3113513.jpg` (CC0): cat lying down, limbs not distinguishable.
- `File:Fossa fossana (white background).jpg`, `File:Mellivora capensis (white background).jpg`:
  printed illustrations, not photographs.
- `File:Siamese Crocodile white background.jpg`: a cut-out with only two legs visible. Kept in
  reserve; not run.
