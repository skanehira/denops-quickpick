import Fuse from "https://deno.land/x/fuse@v6.4.1/dist/fuse.esm.min.js";
import { autocmd, Denops } from "./dep.ts";

export type QuickPickOption = {
  isCaseSensitive?: boolean;
  includeScore?: boolean;
  shouldSort?: boolean;
  includeMatches?: boolean;
  findAllMatches?: boolean;
  minMatchCharLength?: number;
  location?: number;
  threshold?: number;
  distance?: number;
  useExtendedSearch?: boolean;
  ignoreLocation?: boolean;
  ignoreFieldNorm?: boolean;
  keys?: string[];
  callback: (result: unknown) => Promise<unknown>;
};

/**
  * Example:
  *   await quickpick(denops, [
  *     "hello",
  *     "world",
  *     "my",
  *     "name",
  *     "is",
  *     "gorilla",
  *   ], {
  *     callback: async (result: unknown) => {
  *       console.log("got", result);
  *       await Promise.resolve();
  *     },
  *   });
  */
export async function quickpick(
  denops: Denops,
  source: unknown[],
  options: QuickPickOption,
) {
  if (!options.useExtendedSearch) {
    options.useExtendedSearch = true;
  }
  const fuse = new Fuse(source, options);
  await denops.cmd(
    "botright 10new | setlocal buftype=nofile noswapfile winfixheight",
  );
  const listbuf = await denops.call("bufnr");
  await denops.call("setbufline", listbuf, 1, source);
  const listbufWinid = await denops.call(`bufwinid`, listbuf);
  await denops.cmd(
    "botright 1new | setlocal buftype=nofile noswapfile ft=quickpick winfixheight",
  );
  const inputbuf = await denops.call("bufnr");
  const inputbufWinid = await denops.call(`bufwinid`, inputbuf);
  await autocmd.group(denops, "quickpick", (helper) => {
    helper.remove("*", "<buffer>");
    helper.define(
      "TextChangedI",
      "<buffer>",
      `:call denops#notify("${denops.name}", "quickpickUpdateInput", [getline(".")])`,
    );
  });
  const keymaps = [
    `inoremap <buffer> <silent> <CR> <Esc>:call denops#notify("${denops.name}", "quickpickNotify", [])<CR>`,
    `inoremap <buffer> <silent> <C-c> <Esc>:call denops#notify("${denops.name}", "quickpickClose", [])<CR>`,
    `inoremap <buffer> <silent> <C-k> <Esc>:call denops#notify("${denops.name}", "quickpickMoveCursor", ["up"])<CR>`,
    `inoremap <buffer> <silent> <C-j> <Esc>:call denops#notify("${denops.name}", "quickpickMoveCursor", ["down"])<CR>`,
  ];

  keymaps.forEach(async (map) => {
    await denops.cmd(
      `noautocmd keepalt keepjumps silent ${map}`,
    );
  });
  await denops.cmd("startinsert");
  denops.dispatcher["quickpickUpdateInput"] = async (
    input: unknown,
  ) => {
    const result = fuse.search(input);
    await denops.eval(`deletebufline(${listbuf}, 1, '$')`);
    const list = result.map((v) => v.item);
    await denops.call(
      "setbufline",
      listbuf,
      1,
      list.length == 0 ? source : list,
    );
  };

  denops.dispatcher["quickpickClose"] = async () => {
    await denops.cmd(`bw ${inputbuf}`);
    await denops.cmd(`bw ${listbuf}`);
  };

  denops.dispatcher["quickpickNotify"] = async () => {
    await denops.call("win_gotoid", listbufWinid);
    const result = await denops.eval(
      `getbufline(${listbuf}, line("."))`,
    );
    await options.callback(result);
    denops.dispatch(denops.name, "quickpickClose");
  };

  denops.dispatcher["quickpickMoveCursor"] = async (arg: unknown) => {
    const [_, __, col] = await denops.call("getpos", ".") as number[];
    await denops.call("win_gotoid", listbufWinid);
    const cmd = (arg as string) === "up" ? "normal! k" : "normal! j";
    await denops.cmd(cmd);
    await denops.call("win_gotoid", inputbufWinid);
    await denops.cmd(`startinsert | call setpos(".", [0, 1, ${col + 1}, 1])`);
  };
}
