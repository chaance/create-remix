## Michael's feedback

- ~~Remove template question~~
- ~~Use standard app name instead of random name as default~~
- Ensure --version works for setting remix version
- Warn if --version conflicts with version in package.json (should be "\*")

## Other notes

- Release this directly in `create-remix`, lose dependency on and nuke `remix create` command in `remix-dev`
- Iron out any changes and add `@remix-run/cli` package to use tools for rebuilding `remix` dev commands
