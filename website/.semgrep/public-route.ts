// Test cases for public-route.yml (run with: semgrep --test .semgrep)
declare function Public(): any;
declare function Get(path: string): any;

// ruleid: nasj-public-route
@Public()
export class OpenController {}

export class MixedController {
  // ruleid: nasj-public-route
  @Public()
  @Get('open')
  open() {}

  // ok: nasj-public-route
  @Get('private')
  privateRoute() {}
}
