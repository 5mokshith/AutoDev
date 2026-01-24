"use client";
import { Button } from "@/components/ui/button";
import { useMutation, useQuery } from "convex/react";
import { api } from "../../convex/_generated/api";
function hello() {
  const projects = useQuery(api.projects.get);
  const createProject = useMutation(api.projects.create);
  return (
    <div>
      <Button onClick={() => {
        createProject({ name: "Project " });
      }}>
        Create Project
      </Button>
      {projects?.map((project) => {
        return (
          <div key={project._id}>
            <p>{project.name}</p>
          </div>
        )
      })}
    </div>
  );
}


export default hello;