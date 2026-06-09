declare global {
  namespace Express {
    interface Request {
      user?: {
        id: number;
        login: string;
        name: string;
        roleCode: string;
      };

      mobileUser?: {
        id: number;
        login: string;
        cityId: number;
        departmentId: number;
        userKind: "CREW" | "POST";
        crewId?: number | null;
        dutyPostId?: number | null;
        displayName?: string | null;
        departmentType?: "GBR" | "POST" | "OTHER";
      };
    }
  }
}

export {};
