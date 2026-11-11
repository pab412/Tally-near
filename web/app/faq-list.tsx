"use client";

// The Questions page's list: the four groups, and a search box that narrows them as you type.

import Link from "next/link";
import { useState } from "react";
import { FAQ, searchFaq } from "@/lib/faq";
import { Row, Rows, Section } from "./doc-parts";
import { SearchIcon } from "./icons";

export function FaqList() {
  const [typed, setTyped] = useState("");
  const groups = searchFaq(FAQ, typed);
  const found = groups.reduce((n, group) => n + group.questions.length, 0);
  const searching = typed.trim() !== "";

  return (
    <div className="faq">
      <div className="faq-find" role="search">
        <label className="visually-hidden" htmlFor="faq-find">
          Search the questions
        </label>
        <div>
          <SearchIcon />
          <input id="faq-find" type="search" placeholder="Search the questions" autoComplete="off" value={typed} onChange={(e) => setTyped(e.target.value)} />
        </div>
      </div>
      <p className="visually-hidden" role="status">
        {searching ? `${found} ${found === 1 ? "question matches" : "questions match"}` : ""}
      </p>

      {groups.length === 0 && (
        <p className="faq-none">
          No question matches “{typed.trim()}”.{" "}
          <button type="button" className="link-btn" onClick={() => setTyped("")}>
            Show them all
          </button>
        </p>
      )}
      {groups.map((group) => (
        <Section key={group.id} id={group.id} title={group.title}>
          <Rows>
            {group.questions.map(({ q, a, more }) => (
              <Row key={q} title={q}>
                <p>
                  {a}
                  {more && (
                    <>
                      {" "}
                      <Link href={more.href}>{more.label}.</Link>
                    </>
                  )}
                </p>
              </Row>
            ))}
          </Rows>
        </Section>
      ))}
    </div>
  );
}
