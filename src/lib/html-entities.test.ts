import { describe, expect, it } from "vitest";
import { decodeHtmlEntities } from "./html-entities";

describe("decodeHtmlEntities", () => {
	it("decodes named, decimal and hexadecimal references found in copyright footers", () => {
		expect(decodeHtmlEntities("© VisualArt's&frasl;Key&frasl;planetarian project")).toBe(
			"© VisualArt's⁄Key⁄planetarian project",
		);
		expect(decodeHtmlEntities("©UTA&#9734;PRI-ANIME PROJECT")).toBe("©UTA☆PRI-ANIME PROJECT");
		expect(decodeHtmlEntities("&copy;&ensp;2021&#32;Yostar&#xA9;")).toBe("© 2021 Yostar©");
		expect(decodeHtmlEntities("©Pok&eacute;mon")).toBe("©Pokémon");
	});

	it("does not double-decode escaped ampersands and leaves unknown names alone", () => {
		expect(decodeHtmlEntities("&amp;copy;")).toBe("&copy;");
		expect(decodeHtmlEntities("A &unknown; B")).toBe("A &unknown; B");
	});
});
