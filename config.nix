[
  {
    "**/*" = {
      template = {
        prefix = "<!DOCTYPE html><html>";
        postfix = "</html>";
        attribute = "{{([^{}]+)}}";
        nesting = "{{{}}}";
      };
      format = {
        pretty = true;
        minify = false;
        prettierConfig = {
          tabWidth = 4;
          useTabs = false;
          singleQuote = false;
        };
      };
      md = {
        html = true;
        xhtmlOut = true;
        breaks = true;
        langPrefix = "language-";
        linkify = true;
        typographer = true;
        quotes = "“”‘’";
      };
      files = {
        extensions = {
          html = ".html";
          md = ".md";
        };
        md_renderer = "render.htms";
      };
      imports = {
          tag = "IMPORT";
          source = "src";
          alias = "as";
      };
    };
  }
]