// src/middleware.ts が context.locals.user にセットする型を Astro.locals / APIContext.locals へ反映する。
declare namespace App {
	interface Locals {
		user?: import('./lib/user-session').SessionUser | null;
	}
}
