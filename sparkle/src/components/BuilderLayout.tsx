import React from "react";

import {
  ChatBubbleBottomCenterTextIcon,
  ChevronLeftIcon,
  ChevronRightIcon,
  Icon,
  TemplateIcon,
} from "@sparkle/index";
import { classNames } from "@sparkle/lib/utils";

import { Button } from "./Button";

interface BuilderLayoutProps {
  leftPanel: React.ReactNode;
  rightPanel: React.ReactNode;
  isRightPanelOpen: boolean;
  toggleRightPanel: () => void;
  templateMode?: boolean;
}

export function BuilderLayout({
  leftPanel,
  rightPanel,
  isRightPanelOpen,
  toggleRightPanel,
  templateMode,
}: BuilderLayoutProps) {
  return (
    <>
      <div className="px-4 s-flex lg:s-hidden">
        <div className="s-h-full s-w-full s-max-w-[900px]">{leftPanel}</div>
      </div>
      <div className="hidden s-h-full lg:s-flex">
        <div className="s-h-full s-w-full">
          <div className="s-flex s-h-full s-w-full s-items-center s-gap-4 s-px-5">
            <div className="s-flex s-h-full s-grow s-justify-center">
              <div className="s-h-full s-w-full s-max-w-[900px]">
                {leftPanel}
              </div>
            </div>

            <Button
              label="Preview"
              labelVisible={isRightPanelOpen || templateMode ? false : true}
              size="md"
              variant={
                isRightPanelOpen || templateMode ? "tertiary" : "primary"
              }
              icon={isRightPanelOpen ? ChevronRightIcon : ChevronLeftIcon}
              onClick={toggleRightPanel}
              className="border-0"
            />
            {templateMode && !isRightPanelOpen && (
              <div className="flex flex-col text-element-600">
                <Icon visual={TemplateIcon} size="lg" />
                <Icon visual={ChatBubbleBottomCenterTextIcon} size="lg" />
              </div>
            )}

            <div
              className={classNames(
                "s-duration-400 s-h-full s-transition-opacity s-ease-out",
                isRightPanelOpen ? "s-opacity-100" : "s-opacity-0"
              )}
            >
              <div
                className={classNames(
                  "s-duration-800 s-h-full s-overflow-hidden s-transition-all s-ease-out",
                  isRightPanelOpen ? "s-w-[440px]" : "s-w-0"
                )}
              >
                <div className="s-min-w-20 s-h-full s-py-5">{rightPanel}</div>
              </div>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}

BuilderLayout.defaultProps = {
  leftPanel: <>panel</>,
  rightPanel: <>preview</>,
};
