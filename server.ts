import express, { Request, Response, NextFunction } from "express"
import { execSync } from "child_process"

// Deployed builds get the commit baked in via the GIT_COMMIT build arg.
// Locally we fall back to asking git directly.
function currentCommit(): string {
  if (process.env.GIT_COMMIT) {
    return process.env.GIT_COMMIT;
  }
  try {
    return execSync("git rev-parse HEAD", { stdio: ["ignore", "pipe", "ignore"] }).toString().trim();
  } catch {
    return "unknown";
  }
}

export interface BattlesnakeHandlers {
  info: Function;
  start: Function;
  move: Function;
  end: Function;
}

export default function runServer(handlers: BattlesnakeHandlers) {
  const app = express();
  app.use(express.json());
  const commit = currentCommit();

  app.get("/", (req: Request, res: Response) => {
    res.send(handlers.info());
  });

  app.get("/viati", (req: Request, res: Response) => {
    res.type('text/plain').send(`
____   ____.__        __  .__ 
\\   \\ /   /|__|____ _/  |_|__|
 \\   Y   / |  \\__  \\\\   __\\  |
  \\     /  |  |/ __ \\|  | |  |
   \\___/   |__(____  /__| |__|
                   \\/         
             `);
  })

  app.get("/kamel%C3%A5s%C3%A5", (req: Request, res: Response) => {
    res.send('🇩🇰🐷🍻');
  })

  app.get("/version", (req: Request, res: Response) => {
    res.send({ commit });
  });

  app.post("/start", (req: Request, res: Response) => {
    handlers.start(req.body);
    res.send("ok");
  });

  app.post("/move", (req: Request, res: Response) => {
    res.send(handlers.move(req.body));
  });

  app.post("/end", (req: Request, res: Response) => {
    handlers.end(req.body);
    res.send("ok");
  });

  app.use(function(req: Request, res: Response, next: NextFunction) {
    res.set("Server", "battlesnake/github/starter-snake-typescript");
    next();
  });

  const host = '0.0.0.0';
  const port = parseInt(process.env.PORT || '8000');

  app.listen(port, host, () => {
    console.log(`Running Battlesnake at http://${host}:${port}...`);
  });
}
