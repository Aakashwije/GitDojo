import { type CommandSummary } from "@gitdojo/progress";
import { SquareTerminal } from "lucide-react";
import { SectionHeading } from "./SectionHeading";

const SHOWN = 6;

/**
 * The most used Git commands as a table whose bars only illustrate the numbers beside them: a
 * bar's length is uses relative to the top command, its solid part the uses that succeeded.
 */
export function CommandUsage({ summary }: { summary: CommandSummary }) {
  const commands = summary.commands.slice(0, SHOWN);
  const most = commands[0]?.uses ?? 0;
  return (
    <section aria-labelledby="commands-heading">
      <SectionHeading id="commands-heading" icon={SquareTerminal}>
        Most used commands
      </SectionHeading>
      {commands.length === 0 ? (
        <p className="mt-4 text-small text-fg-muted">
          Git commands you run in lessons, challenges, Practice and the playground are counted here.
        </p>
      ) : (
        <>
          <table className="mt-4 w-full text-small" data-testid="command-usage">
            <caption className="sr-only">
              Most used Git commands, with how many times each was run and succeeded
            </caption>
            <thead>
              <tr className="text-left text-caption text-fg-muted">
                <th scope="col" className="pb-2 font-medium">
                  Command
                </th>
                <th scope="col" className="pb-2 text-right font-medium">
                  Uses
                </th>
                <th scope="col" className="pb-2 pl-3 text-right font-medium">
                  Succeeded
                </th>
              </tr>
            </thead>
            <tbody>
              {commands.map((command) => (
                <tr key={command.command} className="border-t border-border-subtle">
                  <th
                    scope="row"
                    className="py-2 pr-3 text-left font-mono font-normal whitespace-nowrap text-fg"
                  >
                    git {command.command}
                  </th>
                  <td className="w-full py-2">
                    <div className="flex items-center justify-end gap-3">
                      <span
                        aria-hidden="true"
                        className="flex h-2 flex-1 justify-start overflow-hidden rounded-full"
                      >
                        <span
                          data-testid="command-bar"
                          className="flex h-full overflow-hidden rounded-full bg-accent-strong/30 transition-[width] duration-500 ease-out"
                          style={{ width: `${String((command.uses / most) * 100)}%` }}
                        >
                          <span
                            className="h-full bg-accent-strong transition-[width] duration-500 ease-out"
                            style={{
                              width: `${String((command.successes / command.uses) * 100)}%`,
                            }}
                          />
                        </span>
                      </span>
                      <span className="w-10 text-right font-mono text-fg">{command.uses}</span>
                    </div>
                  </td>
                  <td className="py-2 pl-3 text-right font-mono whitespace-nowrap text-fg-secondary">
                    {command.successes}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <div className="mt-3 flex flex-wrap gap-x-4 gap-y-1 text-caption text-fg-muted">
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent-strong" />
              Succeeded
            </span>
            <span className="flex items-center gap-1.5">
              <span aria-hidden="true" className="size-2.5 rounded-sm bg-accent-strong/30" />
              Failed
            </span>
          </div>
          <p className="mt-2 text-caption text-fg-muted">
            Every Git command you ran in GitDojo lessons, challenges, Practice and the playground,
            including ones that failed.
            {summary.commands.length > SHOWN
              ? ` Top ${String(SHOWN)} of ${String(summary.commands.length)} commands.`
              : ""}
          </p>
        </>
      )}
    </section>
  );
}
