# HTMS

A simple static site generator

## Usage

### With Nix

A nix package for HTMS is provided by default as part of this flake.

`github:tnichols217/htms#htms` provides a pre-packaged compile of this project.

### Without Nix

This is a `bun` project. Running the `index.ts` file with `bun` should just work.

## How it works

HTMS is a simple SSG that compiles a directory of html representing a website directory stucture.

### Importing

HTMS allows for WebComponents-like components by adding an `import` tag that should be placed at the top of html files.

`import` tags add components from other html files into the current file, while passing all children and attributes to the component.

`import` has two attributes: `src` and `as`, where `src` is the relative path to the component, and `as` is the name of the component you are importing.

Imported components may be used like any other html tag in the rest of that file.

For example, the following code imports a header:

```html
<div>
    <import src="../res/header.html" as="Header"></import>
    <Header attribute_1="123">Some header text</Header>
</div>
```

The header file could look like:

```html
<div>
    <h1 class="{{attribute_1}} header" {{attribute_1}}="Attribute names can be templated too">This is a header {{test-attr}}</h1>
    <p>{{{}}}</p>
</div>
```

Where `{{}}` signifies the placement of an attribute, and `{{{}}}` signifies the placement of its children.

HTMS will then produce the following output:

```html
<!DOCTYPE html>
<html>
    <div>
        <div>
            <h1 class="123 header" 123="Attribute names can be templated too">This is a header 123</h1>
            <p>Some header text</p>
        </div>
    </div>
</html>
```

### Using markdown

Markdown files are also supported.

By having any `.md` file in the source directory, it will automatically be treated as markdown, and rendered to html.

Markdown files require a `render.htms` file, which simply templates the content of the markdown file onto a page.

Templates do not recieve any attibutes, but the content of the markdown file will be given as the template's children.

For example, a simple `render.htms` could look like this:

```html
<div>
    {{{}}}
</div>
```

And with the accompanying markdown of:

```md
# 1

this is a test
```

HTMS will produce the following result:

```html
<!DOCTYPE html>
<html>
    <div>
        <h1>1</h1>
        <p>this is a test</p>
    </div>
</html>
```

## Configuring

The default settings for HTMS may be found in the `config.nix` file.

The file is organized as a list of globs, with later elements taking priority in configuration.

If a file is affected by multiple globs, the configurations will be merged with the last option taking priority.

Things such as the html prefix/postfix are easily configurable as well as formatting configuration, md renderer configuration, and file extensions.

### Markdown

Markdown rendering support is provided by the `markdown-it` package. All relevant config options are equivalent to their documentation

### Prettier

Formatting support is provided by the `prettier` package. All relevant config options also equivalent to their documentation

# TODO

1. The minify option does not do anything at the moment
2. 
