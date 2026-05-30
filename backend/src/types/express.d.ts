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
        };
      }
    }
  }
  
  export {};