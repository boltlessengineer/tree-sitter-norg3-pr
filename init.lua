vim.opt.rtp:prepend(".")
vim.treesitter.language.add("norg", { path = vim.fs.normalize("$HOME/.cache/tree-sitter/lib/norg.so") })
vim.treesitter.language.register("norg", "norg")
