## Michael's feedback

- ~~Remove template question~~
- ~~Use standard app name instead of random name as default~~
- ~~Ensure `--version` works for requesting script version~~
- ~~Ensure `--remix-version` works for setting remix version~~
- Warn if `--remix-version` conflicts with version in `package.json` of template (should look at `@remix-run/react` since that should always be a dep. Expect `"@remix-run/react": "*"`, if not a version is pinned and leave the template alone and just warn)

## Pedro's feedback

- Can the progress bars be hidden after completion? They're a bit distraction IMO if I'm reviewing the output afterwards
- My gut feeling is that the `git` part should come before deps. Installing deps feels more like a "let's get this running" step to me, whereas the git part feels more like template setup before I try to run stuff.

## Other notes

- Release this directly in `create-remix`, lose dependency on and nuke `remix create` command in `remix-dev`
- Iron out any changes and add `@remix-run/cli` package to use tools for rebuilding `remix` dev commands
