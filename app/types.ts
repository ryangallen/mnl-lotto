export type Ball = {
  id: string;
  color: string;
};

export type Team = {
  name: string;
  color: string;
  balls: Ball[];
};
