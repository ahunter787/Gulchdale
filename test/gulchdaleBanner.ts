import { expect } from "chai";

import { shouldShowGulchdaleUpdateBanner } from "../client/src/gulchdaleCompilerStatus.js";

describe("Gulchdale update banner", () => {
	it("is visible only to the owner when an update is available", () => {
		expect(shouldShowGulchdaleUpdateBanner("owner", "owner", "update_available")).to.equal(true);
		expect(shouldShowGulchdaleUpdateBanner("player", "owner", "update_available")).to.equal(false);
		expect(shouldShowGulchdaleUpdateBanner("owner", "owner", "current")).to.equal(false);
		expect(shouldShowGulchdaleUpdateBanner(undefined, undefined, "update_available")).to.equal(false);
	});
});
