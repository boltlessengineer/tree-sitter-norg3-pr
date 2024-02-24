vim.opt.rtp:prepend(".")
if not vim.treesitter.language.get_lang("norg") then
    vim.treesitter.language.add("norg", { path = vim.fs.normalize("$HOME/.cache/tree-sitter/lib/norg.so") })
    vim.treesitter.language.register("norg", "norg")
end
-- rainbow heading
vim.cmd[[
hi link @markup.heading.1.norg @attribute
hi link @markup.heading.2.norg @label
hi link @markup.heading.3.norg @constant
hi link @markup.heading.4.norg @string
hi link @markup.heading.5.norg @label
hi link @markup.heading.6.norg @constructor
hi link @markup.heading.1.marker.norg @attribute
hi link @markup.heading.2.marker.norg @label
hi link @markup.heading.3.marker.norg @constant
hi link @markup.heading.4.marker.norg @string
hi link @markup.heading.5.marker.norg @label
hi link @markup.heading.6.marker.norg @constructor
]]
