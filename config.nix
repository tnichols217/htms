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
          useTabs = true;
          singleQuote = false;
        };
      };
      md = {
        config = {
          html = true;
          xhtmlOut = true;
          breaks = true;
          langPrefix = "language-";
          linkify = true;
          typographer = true;
          quotes = "“”‘’";
        };
        extensions = {
          sub = false;
          sup = false;
          footnote = false;
          deflist = false;
          abbr = false;
          attrs = false;
          emoji = false;
          container = false;
          ins = false;
          mark = false;
          katex = false;
        };
        katex = {
          displayMode = false;
          output = "htmlAndMathml";
          throwOnError = false;
          errorColor = "#cc0000";
          trust = true;
        };
      };
      files = {
        extensions = {
            mapping = {
                ".html" = "html";
                ".md" = "md";
                ".css" = "css";
                ".scss" = "sass";
                ".less" = "less";
                ".js" = "js";
                ".ts" = "ts";
                ".htms" = "ignore";
                default = "copy";
            };
            html = ".html";
            css = ".css";
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